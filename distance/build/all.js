var frequence;
var frequence;
var id;
var lastIdFound;
var slider1 = document.getElementById("myRange1");
var output1 = document.getElementById("sensitivity1");
var slider2 = document.getElementById("myRange2");
var output2 = document.getElementById("sensitivity2");
var curr_volume;
var curr_volume_decimal = 0.5;
var curr_sensitivity;
var curr_volume_decibel = -70;
var audioContext1;
var audioContext2;
var gainNode;
var osc;
var State = {
  IDLE: 1,
  RECV: 2
};

// Create an ultranet server.
var sonicServer = new SonicServer({debug: true});
// Create an ultranet socket.
var sonicSocket = new SonicSender();

var history = document.getElementById('history');
var wrap = document.getElementById('history-wrap');

window.AudioContext = window.AudioContext || window.webkitAudioContext

function init1() {		

  if(audioContext1=== undefined) {
	
	audioContext1 = new AudioContext();
	
	audioContext2 = new AudioContext();
	osc = audioContext2.createOscillator();	
	gainNode = audioContext2.createGain();
	
    audioContext1.resume();
	audioContext2.resume();
	
	sonicServer.start();
	
	sonicServer.on('danger', onDanger);
	sonicSocket.send();

  }  
}

var lastFoundTime = 0;
function onDanger(message) {
	if(!started && !calibrating) {
		return;
	}
	if(calibrating) {
		console.log('received:'+message);
		if(message == id) {
			calibrated = true;
		}
		return;
	}
	var now = new Date().getTime();
  if(now>lastFoundTime+5000 && message<11) {
    document.getElementById("alert-banner").className = "p-status-animation";
	  //push
    lastFoundTime = now;
    lastIdFound = message;  
    document.getElementById('history').innerHTML = time() + ': user ' + message + ' detected<br/>';
    // Scroll history to the bottom.
    wrap.scrollTop = history.scrollHeight;
	if (window.navigator && window.navigator.vibrate) {
	 window.navigator.vibrate([1000, 500, 1000, 500, 2000]);
	 console.log('vibrate');
	} else {
	  beep();
	}		
  }
}

const beep = (freq = 520, duration = 200, vol = 100) => {
    const oscillator = audioContext2.createOscillator();
    const gain = audioContext2.createGain();
    oscillator.connect(gain);
    oscillator.frequency.value = freq;
    oscillator.type = "square";
    gain.connect(audioContext2.destination);
    gain.gain.value = vol * 0.01;
    oscillator.start(audioContext2.currentTime);
    oscillator.stop(audioContext2.currentTime + duration * 0.001);
}

function time() {
  var now = new Date();
  var hours = now.getHours();
  hours = (hours > 9 ? hours: ' ' + hours);
  var mins = now.getMinutes();
  mins = (mins > 9 ? mins : '0' + mins);
  var secs = now.getSeconds();
  secs = (secs > 9 ? secs : '0' + secs);
  return '[' + hours + ':' + mins + ':' + secs + ']';
}

function RingBuffer(maxLength) {
  this.array = [];
  this.maxLength = maxLength;
}

RingBuffer.prototype.get = function(index) {
  if (index >= this.array.length) {
    return null;
  }
  return this.array[index];
};

RingBuffer.prototype.last = function() {
  if (this.array.length == 0) {
    return null;
  }
  return this.array[this.array.length - 1];
}

RingBuffer.prototype.add = function(value) {
  // Append to the end, remove from the front.
  this.array.push(value);
  if (this.array.length >= this.maxLength) {
    this.array.splice(0, 1);
  }
};

RingBuffer.prototype.length = function() {
  // Return the actual size of the array.
  return this.array.length;
};

RingBuffer.prototype.clear = function() {
  this.array = [];
};

RingBuffer.prototype.copy = function() {
  // Returns a copy of the ring buffer.
  var out = new RingBuffer(this.maxLength);
  out.array = this.array.slice(0);
  return out;
};

RingBuffer.prototype.remove = function(index, length) {
  //console.log('Removing', index, 'through', index+length);
  this.array.splice(index, length);
};

function SonicCoder(params) {
  params = params || {};
  this.freqMin = params.freqMin || 16500;
  this.freqMax = params.freqMax || 18500;
  this.freqError = params.freqError || 50;  
}


/**
 * Extracts meaning from audio streams.
 *
 * (assumes audioContext is an AudioContext global variable.)
 *
 * 1. Listen to the microphone.
 * 2. Do an FFT on the input.
 * 3. Extract frequency peaks in the ultrasonic range.
 * 4. Keep track of frequency peak history in a ring buffer.
 * 5. Call back when a peak comes up often enough.
 */
function SonicServer(params) {
  params = params || {};
  this.peakThreshold = curr_volume_decibel;
  this.minRunLength = params.minRunLength || 2;
  this.coder = params.coder || new SonicCoder(params);
  // How long (in ms) to wait for the next character.
  this.timeout = params.timeout || 300;
  this.debug = !!params.debug;

  this.peakHistory = new RingBuffer(16);
  this.peakTimes = new RingBuffer(16);

  this.callbacks = {};

  this.buffer = '';
  this.state = State.IDLE;
  this.isRunning = false;
  this.iteration = 0;
}


/**
 * Start processing the audio stream.
 */
SonicServer.prototype.start = function() {
	
  // Start listening for microphone. Continue init in onStream.
  var constraints = {
  audio: {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
	highpassFilter: false	
  }
};
 
 return	navigator.mediaDevices.getUserMedia(constraints)
      .then(this.onStream_.bind(this))
      .catch((error) => {
        alert('Error with getUserMedia: ' + error.message) // temp: helps when testing for strange issues on ios/safari
        console.log(error)
      });

};

/**
 * Stop processing the audio stream.
 */
SonicServer.prototype.stop = function() {
  this.isRunning = false;
  this.track.stop();
};

SonicServer.prototype.on = function(event, callback) {
  if (event == 'danger') {
    this.callbacks.danger = callback;
  }  
};

SonicServer.prototype.setDebug = function(value) {
  this.debug = value;

  var canvas = document.querySelector('canvas');
  if (canvas) {
    // Remove it.
    canvas.parentElement.removeChild(canvas);
  }
};

SonicServer.prototype.fire_ = function(callback, arg) {
  if (typeof(callback) === 'function') {
    callback(arg);
  }
};

SonicServer.prototype.onStream_ = function(stream) {
	
  // Store MediaStreamTrack for stopping later. MediaStream.stop() is deprecated
  // See https://developers.google.com/web/updates/2015/07/mediastream-deprecations?hl=en
  this.track = stream.getTracks()[0];

  // Setup audio graph.
  var input = audioContext1.createMediaStreamSource(stream);

	// connect the AudioBufferSourceNode to the gainNode
	// and the gainNode to the destination, so we can play the
	// music and adjust the volume using the mouse cursor
	//input.connect(biquadFilter1);
	//input.connect(biquadFilter2);
  
    var analyser = audioContext1.createAnalyser();
	input.connect(analyser);	

  
  // Create the frequency array.
  this.freqs = new Float32Array(analyser.frequencyBinCount);
  // Save the analyser for later.
  this.analyser = analyser;
  this.isRunning = true;
  // Do an FFT and check for inaudible peaks.
  this.raf_(this.loop.bind(this));
};

SonicServer.prototype.onStreamError_ = function(e) {
  console.error('Audio input error:', e);
};

/**
 * Given an FFT frequency analysis, return the peak frequency in a frequency
 * range.
 */
SonicServer.prototype.getPeakFrequency = function() {	
  // Find where to start.
  var start = this.freqToIndex(this.coder.freqMin);
  // TODO: use first derivative to find the peaks, and then find the largest peak.
  // Just do a max over the set.
  var max = -Infinity;
  var index = -1;
  
  for (var i = start; i < this.freqs.length; i++) {
    if (this.freqs[i] > max && (calibrating || Math.round(((this.indexToFreq(i)-16500)/200))!=id)) {
      max = this.freqs[i];
      index = i;
    }
  }
  
  // Only care about sufficiently tall peaks.
  if (max > curr_volume_decibel) {
    if(this.debug && (started || calibrating)) {
		console.log('detect at:'+curr_volume_decibel+' '+this.indexToFreq(index));
	}
    return this.indexToFreq(index);
  } else if(this.debug && (started || calibrating)) {
	console.log('not enough, max was at:'+max+' '+this.indexToFreq(index)+' cut is at '+curr_volume_decibel);
  }	  
  return null;
};

SonicServer.prototype.loop = function() {

  this.analyser.getFloatFrequencyData(this.freqs);
  // Sanity check the peaks every 5 seconds.
  if ((this.iteration + 1) % (60 * 5) == 0) {
    this.restartServerIfSanityCheckFails();
  }
  // Calculate peaks, and add them to history.
  var freq = this.getPeakFrequency();

  if (freq) {
    // DEBUG ONLY: Output the transcribed char.
	//
	this.peakHistory.add(freq);
	this.peakTimes.add(new Date());
	if(this.debug && (started || calibrating)) {
		console.log('Added:'+freq);	
	}
  } else {
    // If no character was detected, see if we've timed out.
    var lastPeakTime = this.peakTimes.last();
    if (lastPeakTime && new Date() - lastPeakTime > this.timeout) {
      // Last detection was over 300ms ago.
      this.state = State.IDLE;
      if (this.debug) {
        console.log('Token', this.buffer, 'timed out');
      }
      this.peakTimes.clear();
    }
  }
  // Analyse the peak history.
  this.analysePeaks();
  // DEBUG ONLY: Draw the frequency response graph.
  if (this.debug) {
    this.debugDraw_();
  }
  if (this.isRunning) {
    this.raf_(this.loop.bind(this));
  }
  this.iteration += 1;
};

SonicServer.prototype.indexToFreq = function(index) {
  var nyquist = audioContext1.sampleRate/2;
  return nyquist/this.freqs.length * index;
};

SonicServer.prototype.freqToIndex = function(frequency) {
  var nyquist = audioContext1.sampleRate/2;
  return Math.round(frequency/nyquist * this.freqs.length);
};

/**
 * Analyses the peak history to find true peaks (repeated over several frames).
 */
SonicServer.prototype.analysePeaks = function() {
  // Look for runs of repeated characters.
  var freq = this.getLastRun();
  if (!freq) {
    return;
  }

  if(freq>16400 && freq<18600) {
	this.fire_(this.callbacks.danger, Math.round(((freq-16500)/200)));
  }  
};

SonicServer.prototype.getLastRun = function() {
  var lastFreq = this.peakHistory.last();
  var runLength = 0;
  // Look at the peakHistory array for patterns like ajdlfhlkjxxxxxx$.
  for (var i = this.peakHistory.length() - 2; i >= 0; i--) {
    var freq = this.peakHistory.get(i);
    if (freq == lastFreq) {
      runLength += 1;
    } else {
      break;
    }
  }
  if (runLength > this.minRunLength) {
    // Remove it from the buffer.
    this.peakHistory.remove(i + 1, runLength + 1);
    return lastFreq;
  }
  return null;
};

/**
 * DEBUG ONLY.
 */
SonicServer.prototype.debugDraw_ = function() {
  var canvas = document.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
  }
  canvas.width = document.body.offsetWidth;
  canvas.height = 380
  drawContext = canvas.getContext('2d');
  // Plot the frequency data.
  for (var i = 0; i < this.freqs.length; i++) {
    var value = this.freqs[i];
    // Transform this value (in db?) into something that can be plotted.
    var height = value + 350
    var offset = canvas.height - height - 1;
    var barWidth = canvas.width/this.freqs.length;
    drawContext.fillStyle = 'black';
    drawContext.fillRect(i * barWidth, offset, 1, 1);
  }
};

/**
 * A request animation frame shortcut. This one is intended to work even in
 * background pages of an extension.
 */
SonicServer.prototype.raf_ = function(callback) {
  var isCrx = !!(window.chrome && chrome.extension);
  if (isCrx) {
    setTimeout(callback, 1000/60);
  } else {
    requestAnimationFrame(callback);
  }
};

SonicServer.prototype.restartServerIfSanityCheckFails = function() {
  // Strange state 1: peaks gradually get quieter and quieter until they
  // stabilize around -800.
  if (this.freqs[0] < -300) {
    console.error('freqs[0] < -300. Restarting.');
    this.restart();
    return;
  }
  // Strange state 2: all of the peaks are -100. Check just the first few.
  var isValid = true;
  for (var i = 0; i < 10; i++) {
    if (this.freqs[i] == -100) {
      isValid = false;
    }
  }
  if (!isValid) {
    console.error('freqs[0:10] == -100. Restarting.');
    this.restart();
  }
}

SonicServer.prototype.restart = function() {
  window.location.reload();  
};

function SonicSender() {
}


SonicSender.prototype.send = function() {
	console.log('Send:'+frequence);   
	gainNode.gain.value = curr_volume_decimal;
    
	osc.connect(gainNode);
	osc.frequency.value = frequence;
	console.log('play at:'+frequence);
    gainNode.connect(audioContext2.destination);
    osc.start();
};
