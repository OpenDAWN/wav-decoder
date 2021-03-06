var DataView2 = require("dataview2").DataView2;

var self = {};

function decoder() {
  self.onmessage = function(e) {
    if (e.data.type === "decode") {
      self.decode(e.data.callbackId, e.data.buffer);
    }
  };

  var formats = {
    0x0001: "lpcm",
    0x0003: "lpcm",
  };

  self.decode = function(callbackId, buffer) {
    function successCallback(audioData) {
      self.postMessage({
        type: "decoded",
        callbackId: callbackId,
        audioData: audioData,
      }, [ audioData.buffers ]);
    }

    function errorCallback(err) {
      self.postMessage({
        type: "error",
        callbackId: callbackId,
        message: err.message,
      });
    }

    self.decodeWav(buffer).then(successCallback, errorCallback);
  };

  self.decodeWav = function(buffer) {
    return new Promise(function(resolve) {
      var reader = new BufferReader(buffer);

      if (reader.readString(4) !== "RIFF") {
        throw new Error("Invalid WAV file");
      }

      reader.readUint32(); // file length

      if (reader.readString(4) !== "WAVE") {
        throw new Error("Invalid WAV file");
      }

      var format = null;
      var audioData = null;

      do {
        var chunkType = reader.readString(4);
        var chunkSize = reader.readUint32();
        switch (chunkType) {
          case "fmt ":
            format = self.decodeFormat(reader, chunkSize);
            break;
          case "data":
            audioData = self.decodeData(reader, chunkSize, format);
            break;
          default:
            reader.skip(chunkSize);
            break;
        }
      } while (audioData === null);

      return resolve(audioData);
    });
  };

  self.decodeFormat = function(reader, chunkSize) {
    var formatId = reader.readUint16();

    if (!formats.hasOwnProperty(formatId)) {
      throw new Error("Unsupported format in WAV file");
    }

    var format = {
      formatId: formatId,
      floatingPoint: formatId === 0x0003,
      numberOfChannels: reader.readUint16(),
      sampleRate: reader.readUint32(),
      byteRate: reader.readUint32(),
      blockSize: reader.readUint16(),
      bitDepth: reader.readUint16(),
    };
    reader.skip(chunkSize - 16);

    return format;
  };

  self.decodeData = function(reader, chunkSize, format) {
    var length = Math.floor(chunkSize / format.blockSize);
    var channelData = new Array(format.numberOfChannels);

    for (var ch = 0; ch < format.numberOfChannels; ch++) {
      channelData[ch] = new Float32Array(length);
    }

    reader.readPCM(channelData, length, format);

    var buffers = channelData.map(function(data) {
      return data.buffer;
    });

    return {
      numberOfChannels: format.numberOfChannels,
      length: length,
      sampleRate: format.sampleRate,
      buffers: buffers,
    };
  };

  function BufferReader(buffer) {
    if (buffer instanceof ArrayBuffer) {
      this.view = new DataView(buffer);
    } else {
      this.view = new DataView2(buffer);
    }
    this.length = this.view.byteLength;
    this.pos = 0;
  }

  BufferReader.prototype.skip = function(n) {
    for (var i = 0; i < n; i++) {
      this.view.getUint8(this.pos++);
    }
  };

  BufferReader.prototype.readUint8 = function() {
    var data = this.view.getUint8(this.pos);
    this.pos += 1;
    return data;
  };

  BufferReader.prototype.readInt16 = function() {
    var data = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return data;
  };

  BufferReader.prototype.readUint16 = function() {
    var data = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return data;
  };

  BufferReader.prototype.readUint32 = function() {
    var data = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return data;
  };

  BufferReader.prototype.readString = function(len) {
    var data = "";
    for (var i = 0; i < len; i++) {
      data += String.fromCharCode(this.readUint8());
    }
    return data;
  };

  BufferReader.prototype.readPCM8 = function() {
    var data = (this.view.getUint8(this.pos) - 128) / 128;
    this.pos += 1;
    return data;
  };

  BufferReader.prototype.readPCM16 = function() {
    var data = this.view.getInt16(this.pos, true) / 32768;
    this.pos += 2;
    return data;
  };

  BufferReader.prototype.readPCM24 = function() {
    var x0 = this.view.getUint8(this.pos + 0);
    var x1 = this.view.getUint8(this.pos + 1);
    var x2 = this.view.getUint8(this.pos + 2);
    var xx = x0 + (x1 << 8) + (x2  << 16);
    var data = ((xx & 0x800000) ? xx - 16777216 : xx) / 8388608;
    this.pos += 3;
    return data;
  };

  BufferReader.prototype.readPCM32 = function() {
    var data = this.view.getInt32(this.pos, true) / 2147483648;
    this.pos += 4;
    return data;
  };

  BufferReader.prototype.readPCM32F = function() {
    var data = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return data;
  };

  BufferReader.prototype.readPCM64F = function() {
    var data = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return data;
  };

  BufferReader.prototype.readPCM = function(channelData, length, format) {
    var numberOfChannels = format.numberOfChannels;
    var method = "readPCM" + format.bitDepth;

    if (format.floatingPoint) {
      method += "F";
    }

    if (!this[method]) {
      throw new Error("not suppoerted bit depth " + format.bitDepth);
    }

    for (var i = 0; i < length; i++) {
      for (var ch = 0; ch < numberOfChannels; ch++) {
        channelData[ch][i] = this[method]();
      }
    }
  };
}

decoder.self = decoder.util = self;

module.exports = decoder;
