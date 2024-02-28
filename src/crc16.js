module.exports = function crc16_update(crc, a) {
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
