/*!
 * TIASound 1.1
 * Emulates the sound capabilities of the Atari TIA chip using Web Audio API.
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

class TIASound {

    /**
     * @param {string} [system='NTSC'] - TV system: 'NTSC' (default) or 'PAL'
     */
    constructor(system = 'NTSC') {

        // Create audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // TV system ('NTSC' or 'PAL') — determines the TIA clock frequency
        this.system = system;
    }

    /**
     * Initialize audio worklet nodes for two sound channels.
     * Must be called inside a user-gesture event handler (click, keydown, etc.)
     * so the AudioContext is allowed to start by the browser.
     * @param {string} [processorPath='TIASoundProcessor.js'] - URL/path to TIASoundProcessor.js
     */
    async init(processorPath = 'TIASoundProcessor.js'){

        // Resume the AudioContext (browsers suspend it until a user gesture)
        await this.audioContext.resume();

        // Load the audio processor module
        await this.audioContext.audioWorklet.addModule(processorPath);

        // Create and connect two sound nodes, then send the system config to each
        this.soundNode0 = new AudioWorkletNode(this.audioContext, 'TIASoundProcessor');
        this.soundNode0.connect(this.audioContext.destination);
        this.soundNode0.port.postMessage({ type: 'config', system: this.system });

        this.soundNode1 = new AudioWorkletNode(this.audioContext, 'TIASoundProcessor');
        this.soundNode1.connect(this.audioContext.destination);
        this.soundNode1.port.postMessage({ type: 'config', system: this.system });

    }

    /**
     * Convert sound type identifier to numeric AUDC value.
     * @param {string|number} s - Sound type identifier (name or number)
     * @returns {number} Numeric AUDC value
     */
    id(s) {

        // Map of named sound types to their numeric values
        const sounds = {
            saw: 1,
            engine: 3,
            square: 4,
            bass: 6,
            pitfall: 7,
            noise: 8,
            lead: 12,
            buzz: 15
        };
        
        if (typeof s === 'number') {
            return s;
        } else if (typeof s === 'string') {
            return sounds[s.toLowerCase()] || 0;
        } else {
            return 0;
        }
    }

    /**
     * Set parameters for a specific sound channel.
     * @param {number} C    - Channel number (0 or 1)
     * @param {number} AUDF - Frequency divisor (0-31)
     * @param {number} AUDC - Control / sound type (0-15, or named string)
     * @param {number} AUDV - Volume (0-15)
     */
    setChannel(C, AUDF, AUDC, AUDV){
        AUDF = this.id(AUDF);  // numeric pass-through; allows future named frequency aliases
        AUDC = this.id(AUDC);  // resolves named types ('square', 'noise', …) to AUDC numbers
        this[`soundNode${C}`].port.postMessage({ AUDV, AUDC, AUDF });
    }

    /**
     * Set parameters for channel 0.
     * @param {number}        AUDF - Frequency divisor (0-31)
     * @param {number|string} AUDC - Control / sound type (0-15, or named string)
     * @param {number}        [AUDV=8] - Volume (0-15, defaults to 8)
     */
    setChannel0(AUDF, AUDC, AUDV = 8){
        this.setChannel(0, AUDF, AUDC, AUDV);
    }

    /**
     * Set parameters for channel 1.
     * @param {number}        AUDF - Frequency divisor (0-31)
     * @param {number|string} AUDC - Control / sound type (0-15, or named string)
     * @param {number}        [AUDV=8] - Volume (0-15, defaults to 8)
     */
    setChannel1(AUDF, AUDC, AUDV = 8){
        this.setChannel(1, AUDF, AUDC, AUDV);
    }

    /**
     * Convenience method to play sound on channel 0.
     * @param {number}        AUDF - Frequency divisor (0-31)
     * @param {number|string} AUDC - Control / sound type (0-15, or named string)
     * @param {number}        [AUDV=8] - Volume (0-15, defaults to 8)
     */
    play(AUDF, AUDC, AUDV = 8){
        this.setChannel0(AUDF, AUDC, AUDV);
    }

    /**
     * Silence one or both channels by setting volume to 0.
     * @param {number} [channel] - Channel to silence (0 or 1). Omit to silence both.
     */
    stop(channel){
        if (channel === undefined) {
            this.setChannel(0, 0, 0, 0);
            this.setChannel(1, 0, 0, 0);
        } else {
            this.setChannel(channel, 0, 0, 0);
        }
    }

}