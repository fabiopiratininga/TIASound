
/*!
 * TIASoundProcessor 2.2
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

        // TIA sound registers
        this.AUDV = 0;  // Volume  (0-15)
        this.AUDC = 0;  // Control (0-15)
        this.AUDF = 0;  // Frequency divisor (0-31)

        // Persistent sample-rate conversion accumulator (carries fractional phase across blocks)
        this.rateAcc = 0;

        // LFSR / counter state — stored as flat properties to avoid double-dereference in process()
        this.reset();

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
        this.p4        = 0xF;    // 4-bit poly LFSR  (polynomial x^4 + x + 1,   period 15)
        this.p5        = 0x1F;   // 5-bit poly LFSR  (polynomial x^5 + x^2 + 1, period 31)
        this.p9        = 0x1FF;  // 9-bit poly LFSR  (polynomial x^9 + x^4 + 1, period 511)
        this.tone      = 1;      // Pure-tone flip-flop
        this.div3      = 3;      // ÷3 counter used by AUDC modes 14 and 15
        this.freqCount = 0;      // Frequency-divider counter (counts up to AUDF+1)
        this.out       = 1;      // Current audio output bit
    }

    // Main audio processing function — generates TIA sound output sample by sample
    process(input, outputs, parameters) {

        const outputChannel = outputs[0][0];
        const bufferLength  = outputChannel.length;

        // Hoist all instance fields to locals — a single property lookup per block
        // instead of repeated this.* dereferences inside the hot loop.
        const SR      = this.SAMPLE_RATE;
        const TCLK    = this.TIA_CLOCK;
        const freqDiv = this.AUDF + 1;    // sound generator fires once every freqDiv TIA ticks
        const volume  = this.AUDV / 30;   // convert 4-bit volume (0-15) to float amplitude (0–0.5)
        const audc    = this.AUDC;

        let rateAcc   = this.rateAcc;
        let freqCount = this.freqCount;
        let out       = this.out;
        let p4        = this.p4;
        let p5        = this.p5;
        let p9        = this.p9;
        let tone      = this.tone;
        let div3      = this.div3;

        let bufferIndex = 0;

        while (bufferIndex < bufferLength) {

            // Advance TIA frequency counter; use >= so a decrease in AUDF never stalls the divider
            if (++freqCount >= freqDiv) {
                freqCount = 0;

                // Advance the sound generator — LFSR steps inlined to avoid method-call overhead
                switch (audc) {

                    // SET (DC high / silence)
                    case 0:
                    case 11:
                        out = 1;
                        break;

                    // 4-bit poly
                    case 1: {
                        const fb = ((p4 >> 1) ^ p4) & 1;
                        p4 = ((p4 >> 1) | (fb << 3)) & 0xF;
                        out = p4 & 1;
                        break;
                    }

                    // 5-bit poly gating 4-bit poly
                    case 2:
                    case 3: {
                        const fb5 = ((p5 >> 2) ^ p5) & 1;
                        p5 = ((p5 >> 1) | (fb5 << 4)) & 0x1F;
                        if (p5 & 1) {
                            const fb4 = ((p4 >> 1) ^ p4) & 1;
                            p4 = ((p4 >> 1) | (fb4 << 3)) & 0xF;
                        }
                        out = p4 & 1;
                        break;
                    }

                    // Pure tone (toggle flip-flop)
                    case 4:
                    case 5:
                    case 12:
                    case 13:
                        tone ^= 1;
                        out = tone;
                        break;

                    // 5-bit poly gating pure tone
                    case 6: {
                        const fb5 = ((p5 >> 2) ^ p5) & 1;
                        p5 = ((p5 >> 1) | (fb5 << 4)) & 0x1F;
                        if (p5 & 1) tone ^= 1;
                        out = tone;
                        break;
                    }

                    // 5-bit poly
                    case 7:
                    case 9: {
                        const fb5 = ((p5 >> 2) ^ p5) & 1;
                        p5 = ((p5 >> 1) | (fb5 << 4)) & 0x1F;
                        out = p5 & 1;
                        break;
                    }

                    // 9-bit poly (white noise)
                    case 8: {
                        const fb9 = ((p9 >> 4) ^ p9) & 1;
                        p9 = ((p9 >> 1) | (fb9 << 8)) & 0x1FF;
                        out = p9 & 1;
                        break;
                    }

                    // 5-bit poly gating 9-bit poly
                    case 10: {
                        const fb5 = ((p5 >> 2) ^ p5) & 1;
                        p5 = ((p5 >> 1) | (fb5 << 4)) & 0x1F;
                        if (p5 & 1) {
                            const fb9 = ((p9 >> 4) ^ p9) & 1;
                            p9 = ((p9 >> 1) | (fb9 << 8)) & 0x1FF;
                        }
                        out = p9 & 1;
                        break;
                    }

                    // Pure tone with ÷3 pre-divider (effective period = 6 × (AUDF+1))
                    case 14:
                        if (--div3 === 0) { div3 = 3; tone ^= 1; }
                        out = tone;
                        break;

                    // 5-bit poly with ÷3 pre-divider (sequence period = 93 × (AUDF+1))
                    case 15:
                        if (--div3 === 0) {
                            div3 = 3;
                            const fb5 = ((p5 >> 2) ^ p5) & 1;
                            p5 = ((p5 >> 1) | (fb5 << 4)) & 0x1F;
                        }
                        out = p5 & 1;
                        break;
                }
            }

            // Sample-rate conversion: map TIA clock ticks → output samples.
            // rateAcc persists across process() calls to avoid phase jitter.
            // The guard (bufferIndex < bufferLength) prevents writing past the buffer end
            // when the ratio SAMPLE_RATE/TIA_CLOCK causes a tick to emit 2 samples.
            rateAcc += SR;
            while (rateAcc >= TCLK && bufferIndex < bufferLength) {
                outputChannel[bufferIndex++] = out * volume;
                rateAcc -= TCLK;
            }
        }

        // Write locals back to instance state for the next process() call
        this.rateAcc   = rateAcc;
        this.freqCount = freqCount;
        this.out       = out;
        this.p4        = p4;
        this.p5        = p5;
        this.p9        = p9;
        this.tone      = tone;
        this.div3      = div3;

        return true;
    }
}


// Register the TIASoundProcessor worklet with the audio context
registerProcessor('TIASoundProcessor', TIASoundProcessor);