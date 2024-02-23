if (!Array.prototype.chain) {
  Array.prototype.chain = function chain(fnc, i = 0) {
    let itm = this[i];
    if (itm) {
      return Promise.resolve(fnc(itm, i)).then(() => {
        return chain.call(this, fnc, i + 1);
      });
    }
    return Promise.resolve();
  };
}
