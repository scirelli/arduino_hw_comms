/*
 * References:
 *  https://en.wikipedia.org/wiki/Cyclic_redundancy_check
 *  https://github.com/matthijskooijman/arduino-dsmr/blob/master/src/dsmr/crc16.h
 *  https://www.nongnu.org/avr-libc/user-manual/group__util__crc.html#ga95371c87f25b0a2497d9cba13190847f
 */

//Reverse
module.exports.crc16_rev_update = function crc16_rev_update(crc, a) {
  crc ^= a;
  for (let i = 0; i < 8; ++i) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xA001;
      } else {
        crc = (crc >>> 1);
      }
  }
  return crc;
}

//Normal
module.exports.crc16_update = function crc16_update(crc, a) {
  crc ^= a;
  for (let i = 0; i < 8; ++i) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0x8005;
      } else {
        crc = (crc >>> 1);
      }
  }
  return crc;
}

//reciprocal 
// 0x4003
//reverse reciprocal 
// 0xC002
