
/*!
 * TIASoundProcessor 2.1
 * Audio processor that emulates the Atari 2600's TIA sound chip.
 * Implements the core sound generation logic using real LFSR (Linear Feedback
 * Shift Register) models identical to the Atari 2600 TIA hardware, replacing
 * the previous pre-computed run-length-encoded polynomial approximation.
 * https://github.com/fabiopiratininga/TIASound
 *
 * LFSR polynomials (Fibonacci form, right-shift, feedback inserted at MSB):
 *   Poly4 — x^4 + x + 1,      taps at bits 1 and 0, period 15
 *   Poly5 — x^5 + x^2 + 1,    taps at bits 2 and 0, period 31
 *   Poly9 — x^9 + x^4 + 1,    taps at bits 4 and 0, period 511
 *
 * AUDC mode map (each tick = one AUDF+1 TIA-clock period):
 *   0  SET        — output held at 1 (DC / silence)
 *   1  POLY4      — clock poly4; output = poly4 LSB
 *   2  POLY5→4    — clock poly5; clock poly4 only when poly5 LSB = 1; output = poly4 LSB
 *   3  POLY5→4    — same as mode 2
 *   4  TONE       — toggle tone flip-flop; output = flip-flop
 *   5  TONE       — same as mode 4
 *   6  POLY5→TONE — clock poly5; toggle tone only when poly5 LSB = 1; output = flip-flop
 *   7  POLY5      — clock poly5; output = poly5 LSB
 *   8  POLY9      — clock poly9; output = poly9 LSB  (white noise)
 *   9  POLY5      — same as mode 7
 *  10  POLY5→9    — clock poly5; clock poly9 only when poly5 LSB = 1; output = poly9 LSB
 *  11  SET        — output held at 1 (DC / silence)
 *  12  TONE       — same as mode 4
 *  13  TONE       — same as mode 5
 *  14  TONE ÷3    — extra ÷3 pre-divider, then toggle tone; output = flip-flop
 *  15  POLY5 ÷3   — extra ÷3 pre-divider, then clock poly5; output = poly5 LSB
 *
 * Configuration message (sent once after node creation):
 *   { type: 'config', system: 'NTSC' | 'PAL' }
 *     NTSC TIA clock: 3.579545 MHz / 114 ≈ 31400 Hz
 *     PAL  TIA clock: 3.546894 MHz / 114 ≈ 31112 Hz
 *
 * MIT License
 *
 * Copyright (c) 2025 Fabio Cardoso
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

class TIASoundProcessor extends AudioWorkletProcessor {

    // Initializes audio parameters and sets up message handling
    constructor() {
        super();

        // Sample rates
        this.SAMPLE_RATE = (typeof sampleRate !== 'undefined') ? sampleRate : 48000;  // Output sample rate (AudioWorklet global)
        this.TIA_CLOCK = 31400;            // TIA chip native audio clock — NTSC default (3.579545 MHz / 114)

        // Initialize LFSR state
        this.reset();

        // TIA sound registers
        this.AUDV = 0;  // Volume  (0-15)
        this.AUDC = 0;  // Control (0-15)
        this.AUDF = 0;  // Frequency divisor (0-31)

        // Persistent sample-rate conversion accumulator (carries fractional phase across blocks)
        this.rateAcc = 0;

        // Handle incoming messages to update sound registers or configuration
        this.port.onmessage = (event) => {
            const data = event.data;

            // Configuration message — set system clock (NTSC / PAL)
            if (data.type === 'config') {
                this.TIA_CLOCK = (data.system === 'PAL') ? 31112 : 31400;
                return;
            }

            const { AUDV, AUDC, AUDF } = data;

            // Update volume and frequency registers freely (no state reset needed)
            this.AUDV = this.clamp(AUDV, 0, 15);
            this.AUDF = this.clamp(AUDF, 0, 31);

            // Update control register; reset LFSR state only when the sound mode changes
            const nextAUDC = this.clamp(AUDC, 0, 15);
            if (nextAUDC !== this.AUDC) {
                this.AUDC = nextAUDC;
                this.reset();
            }
        };
    }

    // Clamps a value between a minimum and maximum
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // Resets all LFSR and counter state to power-on defaults
    reset() {
        this.state = {
            p4:        0xF,    // 4-bit poly LFSR  (polynomial x^4 + x + 1,   period 15)
            p5:        0x1F,   // 5-bit poly LFSR  (polynomial x^5 + x^2 + 1, period 31)
            p9:        0x1FF,  // 9-bit poly LFSR  (polynomial x^9 + x^4 + 1, period 511)
            tone:      1,      // Pure-tone flip-flop
            div3:      3,      // ÷3 counter used by AUDC modes 14 and 15
            freqCount: 0,      // Frequency-divider counter (counts up to AUDF+1)
            out:       1,      // Current audio output bit
        };
    }

    // Clock the 4-bit LFSR — polynomial x^4 + x + 1, taps at bits 1 and 0
    clockP4() {
        const b = ((this.state.p4 >> 1) ^ this.state.p4) & 1;
        this.state.p4 = ((this.state.p4 >> 1) | (b << 3)) & 0xF;
    }

    // Clock the 5-bit LFSR — polynomial x^5 + x^2 + 1, taps at bits 2 and 0
    clockP5() {
        const b = ((this.state.p5 >> 2) ^ this.state.p5) & 1;
        this.state.p5 = ((this.state.p5 >> 1) | (b << 4)) & 0x1F;
    }

    // Clock the 9-bit LFSR — polynomial x^9 + x^4 + 1, taps at bits 4 and 0
    clockP9() {
        const b = ((this.state.p9 >> 4) ^ this.state.p9) & 1;
        this.state.p9 = ((this.state.p9 >> 1) | (b << 8)) & 0x1FF;
    }

    // Main audio processing function — generates TIA sound output sample by sample
    process(input, outputs, parameters) {

        // Write directly into the output buffer provided by the AudioWorklet (no intermediate copy)
        const outputChannel = outputs[0][0];
        const bufferLength = outputChannel.length;

        let bufferIndex = 0;

        // Frequency divisor: the sound generator advances once every AUDF+1 TIA clock ticks
        const freqDiv = this.AUDF + 1;

        // Convert 4-bit volume (0-15) to float amplitude (0–0.5)
        const volume = this.AUDV / 30;

        while (bufferIndex < bufferLength) {

            // Advance TIA frequency counter by one TIA clock tick
            this.state.freqCount++;

            // When the frequency divider fires, advance the sound generator
            if (this.state.freqCount === freqDiv) {
                this.state.freqCount = 0;

                switch (this.AUDC) {

                    // SET (DC high / silence)
                    case 0:
                    case 11:
                        this.state.out = 1;
                        break;

                    // 4-bit poly
                    case 1:
                        this.clockP4();
                        this.state.out = this.state.p4 & 1;
                        break;

                    // 5-bit poly gating 4-bit poly
                    case 2:
                    case 3:
                        this.clockP5();
                        if (this.state.p5 & 1) this.clockP4();
                        this.state.out = this.state.p4 & 1;
                        break;

                    // Pure tone (toggle flip-flop)
                    case 4:
                    case 5:
                    case 12:
                    case 13:
                        this.state.tone ^= 1;
                        this.state.out = this.state.tone;
                        break;

                    // 5-bit poly gating pure tone
                    case 6:
                        this.clockP5();
                        if (this.state.p5 & 1) this.state.tone ^= 1;
                        this.state.out = this.state.tone;
                        break;

                    // 5-bit poly
                    case 7:
                    case 9:
                        this.clockP5();
                        this.state.out = this.state.p5 & 1;
                        break;

                    // 9-bit poly (white noise)
                    case 8:
                        this.clockP9();
                        this.state.out = this.state.p9 & 1;
                        break;

                    // 5-bit poly gating 9-bit poly
                    case 10:
                        this.clockP5();
                        if (this.state.p5 & 1) this.clockP9();
                        this.state.out = this.state.p9 & 1;
                        break;

                    // Pure tone with ÷3 pre-divider (effective period = 6 × (AUDF+1))
                    case 14:
                        if (--this.state.div3 === 0) {
                            this.state.div3 = 3;
                            this.state.tone ^= 1;
                        }
                        this.state.out = this.state.tone;
                        break;

                    // 5-bit poly with ÷3 pre-divider (sequence period = 93 × (AUDF+1))
                    case 15:
                        if (--this.state.div3 === 0) {
                            this.state.div3 = 3;
                            this.clockP5();
                        }
                        this.state.out = this.state.p5 & 1;
                        break;
                }
            }

            // Sample-rate conversion: map TIA clock ticks → output samples.
            // rateAcc persists across process() calls to avoid phase jitter.
            // The guard (bufferIndex < bufferLength) prevents writing past the buffer end
            // when the ratio SAMPLE_RATE/TIA_CLOCK causes a tick to emit 2 samples.
            this.rateAcc += this.SAMPLE_RATE;
            while (this.rateAcc >= this.TIA_CLOCK && bufferIndex < bufferLength) {
                outputChannel[bufferIndex++] = this.state.out * volume;
                this.rateAcc -= this.TIA_CLOCK;
            }
        }

        return true;
    }
}


// Register the TIASoundProcessor worklet with the audio context
registerProcessor('TIASoundProcessor', TIASoundProcessor);