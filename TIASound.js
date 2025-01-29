/*!
 * TIASound 1.0
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
    constructor() {

        // Create audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Initialize audio worklet nodes for two sound channels

    async init(){

        // Load the audio processor module
        await this.audioContext.audioWorklet.addModule('TIASoundProcessor.js');

        // Create and connect two sound nodes
        this.soundNode0 = new AudioWorkletNode(this.audioContext, 'TIASoundProcessor');
        this.soundNode0.connect(this.audioContext.destination);
        this.soundNode1 = new AudioWorkletNode(this.audioContext, 'TIASoundProcessor');
        this.soundNode1.connect(this.audioContext.destination);

    }

    /**
     * Convert sound type identifier to numeric value
     * @param {string|number} s - Sound type identifier
     * @returns {number} Numeric sound type value
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
     * Set parameters for a specific sound channel
     * @param {number} C - Channel number (0 or 1)
     * @param {number} AUDV - Volume
     * @param {number} AUDC - Control
     * @param {number} AUDF - Frequency
     */
    setChannel(C, AUDV, AUDC, AUDF){
        AUDF = this.id(AUDF);
        AUDC = this.id(AUDC);
        AUDV = this.id(AUDV);
        this[`soundNode${C}`].port.postMessage({ AUDV, AUDC, AUDF });
    }

    /**
     * Set parameters for channel 0
     * @param {number} AUDF - Frequency
     * @param {number} AUDC - Control
     * @param {number} AUDV - Volume (defaults to 8)
     */
    setChannel0(AUDF, AUDC, AUDV = 8){
        this.setChannel(0, AUDV, AUDC, AUDF);
    }

    /**
     * Set parameters for channel 1
     * @param {number} AUDV - Volume
     * @param {number} AUDC - Control
     * @param {number} AUDF - Frequency
     */
    setChannel1(AUDV, AUDC, AUDF){
        this.setChannel(1, AUDV, AUDC, AUDF);
    }

    /**
     * Convenience method to play sound on channel 0
     * @param {number} AUDF - Frequency
     * @param {number} AUDC - Control
     * @param {number} AUDV - Volume (defaults to 8)
     */
    play(AUDF, AUDC, AUDV = 8){
        this.setChannel0(AUDF, AUDC, AUDV);
    }

}