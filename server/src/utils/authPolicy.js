const integer=(name,fallback,min,max)=>{
  const n=Number(process.env[name]);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;
};
export function authPolicy() {
  return {maxFailures:integer('AUTH_MAX_FAILED_ATTEMPTS',5,1,20),windowMinutes:integer('AUTH_ATTEMPT_WINDOW_MINUTES',15,1,60),
    restrictionMinutes:integer('AUTH_RESTRICTION_MINUTES',15,1,60),loginIpLimit:integer('AUTH_LOGIN_IP_LIMIT',30,5,1000),
    delayStepMs:integer('AUTH_LOGIN_DELAY_STEP_MS',100,0,1000),maxDelayMs:integer('AUTH_LOGIN_MAX_DELAY_MS',1000,450,3000)};
}
