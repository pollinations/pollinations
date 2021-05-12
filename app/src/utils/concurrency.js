import LimitConcurrency from "p-limit";

const concurrencyLimiter = LimitConcurrency(30);

const limit = f => (...args) => concurrencyLimiter(() => f(...args));

export default limit;