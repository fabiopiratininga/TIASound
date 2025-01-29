
/*!
 * TIASoundProcessor 1.0
 * Audio processor that emulates the Atari 2600's TIA sound chip.
 * Implements the core sound generation logic for producing authentic Atari-style audio waveforms.
 * https://github.com/fabiopiratininga/TIASound
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
    
    //Initializes audio parameters and sets up message handling
    constructor(){
        super();

        // Sample rates
        this.SAMPLE_RATE = 48000;      // Output sample rate
        this.TIA_SAMPLE_RATE = 31440;  // TIA chip native rate
        
        // Initialize state and polynomials
        this.reset();
        this.setPoly();
        
        // TIA sound registers
        this.AUDV = 0;  // Volume (0-15)
        this.AUDC = 0;  // Control (0-15) 
        this.AUDF = 0;  // Frequency (0-31)
        
        // Audio output buffer
        this.buffer = new Float32Array(128);

        // Handle incoming messages to update sound registers
        this.port.onmessage = (event) => {
            // Reset internal state
            this.reset();
            // Destructure the received register values
            const { AUDV, AUDC, AUDF } = event.data;
            // Update volume register (0-15)
            this.AUDV = this.clamp(AUDV, 0, 15);
            // Update control register (0-15)
            this.AUDC = this.clamp(AUDC, 0, 15); 
            // Update frequency register (0-31)
            this.AUDF = this.clamp(AUDF, 0, 31);
        };

    }

    // Clamps a value between a minimum and maximum
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }


    // Sets up polynomial sequences and frequency divisors for TIA sound generation
    setPoly(){
        const p0 = [1, -1];
        const p1 = [1, 1, -1];
        const p2 = [16, 15, -1];
        const p3 = [1, 2, 2, 1, 1, 1, 4, 3, -1];
        const p4 = [1, 2, 1, 1, 2, 2, 5, 4, 2, 1, 3, 1, 1, 1, 1, 4, -1];
        const p5 = [1, 4, 1, 3, 2, 4, 1, 2, 3, 2, 1, 1, 1, 1, 1, 1, 2, 4, 2, 1, 4, 1, 1, 2, 2, 1, 3, 2, 1, 3, 1, 1, 1, 4, 1, 1, 1, 1, 2, 1, 1, 2, 6, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 6, 2, 1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 7, 2, 3, 2, 2, 1, 1, 1, 3, 2, 1, 1, 2, 1, 1, 7, 1, 1, 3, 1, 1, 2, 3, 3, 1, 1, 1, 2, 2, 1, 1, 2, 2, 4, 3, 5, 1, 3, 1, 1, 5, 2, 1, 1, 1, 2, 1, 2, 1, 3, 1, 2, 5, 1, 1, 2, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1, 6, 1, 1, 1, 2, 1, 1, 1, 1, 4, 2, 1, 1, 3, 1, 3, 6, 3, 2, 3, 1, 1, 2, 1, 2, 4, 1, 1, 1, 3, 1, 1, 1, 1, 3, 1, 2, 1, 4, 2, 2, 3, 4, 1, 1, 4, 1, 2, 1, 2, 2, 2, 1, 1, 4, 3, 1, 4, 4, 9, 5, 4, 1, 5, 3, 1, 1, 3, 2, 2, 2, 1, 5, 1, 2, 1, 1, 1, 2, 3, 1, 2, 1, 1, 3, 4, 2, 5, 2, 2, 1, 2, 3, 1, 1, 1, 1, 1, 2, 1, 3, 3, 3, 2, 1, 2, 1, 1, 1, 1, 1, 3, 3, 1, 2, 2, 3, 1, 3, 1, 8, -1];
        const p6 = [5, 6, 4, 5, 10, 5, 3, 7, 4, 10, 6, 3, 6, 4, 9, 6, -1];
        const p7 = [2, 3, 2, 1, 4, 1, 6, 10, 2, 4, 2, 1, 1, 4, 5, 9, 3, 3, 4, 1, 1, 1, 8, 5, 5, 5, 4, 1, 1, 1, 8, 4, 2, 8, 3, 3, 1, 1, 7, 4, 2, 7, 5, 1, 3, 1, 7, 4, 1, 4, 8, 2, 1, 3, 4, 7, 1, 3, 7, 3, 2, 1, 6, 6, 2, 2, 4, 5, 3, 2, 6, 6, 1, 3, 3, 2, 5, 3, 7, 3, 4, 3, 2, 2, 2, 5, 9, 3, 1, 5, 3, 1, 2, 2, 11, 5, 1, 5, 3, 1, 1, 2, 12, 5, 1, 2, 5, 2, 1, 1, 12, 6, 1, 2, 5, 1, 2, 1, 10, 6, 3, 2, 2, 4, 1, 2, 6, 10, -1];
        this.polys = [p0, p3, p3, p7, p1, p1, p2, p4, p5, p4, p2, p0, p1, p1, p2, p6];
        this.divisors = [1, 1, 15, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 1];
    }
    
    // Resets all internal state variables to their default values. Called when new register values are received to ensure clean state.
    reset(){
        this.state = {
            offset: 0,
            count: 0,
            last: 1,
            f: 0,
            rate: 0
        };
    }


    // Main audio processing function that generates TIA sound output
    process(input, outputs, parameters) {

        // Get first output channel
        const output = outputs[0];
        
        // Track sample rate conversion
        let rate = 0;
        let bufferIndex = 0;

        // Calculate frequency divisor based on current control and frequency registers
        const divisor = this.divisors[this.AUDC] * (this.AUDF + 1);
        
        // Convert 4-bit volume (0-15) to float (0-0.5)
        const volume = this.AUDV / 30;

        // Process audio samples
        while (bufferIndex < this.buffer.length) {
            // Increment frequency counter
            this.state.f += 1;

            // When divisor is reached, process next polynomial value
            if (this.state.f === divisor) {
                this.poly = this.polys[this.AUDC];
                this.state.f = 0;
                this.state.count += 1;

                // Check if we've reached end of current polynomial segment
                if (this.state.count === this.poly[this.state.offset]) {
                    this.state.offset += 1;
                    this.state.count = 0;
                    // Loop back to start if we hit end marker (-1)
                    if (this.poly[this.state.offset] === -1) {
                        this.state.offset = 0;
                    }
                }

                // Generate output level (0 or 1) based on polynomial position
                this.state.last = (this.state.offset % 2 === 0) ? 1 : 0;
            }

            // Handle sample rate conversion from TIA to output rate
            rate += this.SAMPLE_RATE;
            while (rate >= this.TIA_SAMPLE_RATE) {

                // Apply volume to output level
                const s = this.state.last ? 1 : 0;
                this.buffer[bufferIndex] = s * volume;
                bufferIndex++;
                rate -= this.TIA_SAMPLE_RATE;

            }
        }

        // Copy buffer to output and continue processing
        output[0].set(this.buffer);
        return true;
    }
}


// Register the TIASoundProcessor worklet with the audio context
registerProcessor('TIASoundProcessor', TIASoundProcessor);