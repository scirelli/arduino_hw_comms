if (!Function.prototype.delay) {
  Function.prototype.delay = function delay(thsPtr, time) {
    let args = Array.prototype.slice.call(arguments, 2);

    time = parseInt(time) || 0;

    return new Promise((resolve) => {
      setTimeout(
        (...args) => {
          resolve(this.apply(thsPtr, args));
        },
        time,
        ...args,
      );
    });
  };
}

if (!Function.prototype.defer) {
  Function.prototype.defer = function defer(/*thsPtr*/) {
    Array.prototype.splice.call(arguments, 1, 0, 0);
    return this.delay.apply(this, arguments);
  };
}

if (!Function.prototype.chain) {
  Function.prototype.chain = function chain(iter) {
    let itm = iter.next();
    if (!itm.done) {
      return Promise.resolve(this(itm.value)).then(() => {
        return chain.call(this, iter);
      });
    }
    return Promise.resolve();
  };
}

if (!Function.prototype.loopChain) {
	Function.prototype.loopChain = function loopChain(iterations, i=0) {
		if(i>=iterations) return;
		return this().then(()=> {
			return this.loopChain(iterations, ++i);
		});
	}
}
