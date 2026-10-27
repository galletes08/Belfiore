// Authenticated customer-only limit, independent of Admin/Rider login policies.
// One atomic upsert serializes concurrent requests across server processes.
export async function consumeCustomerPasswordAttempt(db,userId) {
  if(!Number.isSafeInteger(Number(userId))||Number(userId)<1)return false;
  const result=await db.query(`INSERT INTO auth_security_buckets(key,count,window_start)
    VALUES($1,1,clock_timestamp()) ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN auth_security_buckets.window_start<=clock_timestamp()-INTERVAL '15 minutes' THEN 1 ELSE auth_security_buckets.count+1 END,
      window_start=CASE WHEN auth_security_buckets.window_start<=clock_timestamp()-INTERVAL '15 minutes' THEN clock_timestamp() ELSE auth_security_buckets.window_start END
    WHERE auth_security_buckets.count<10 OR auth_security_buckets.window_start<=clock_timestamp()-INTERVAL '15 minutes'
    RETURNING count`,['customer-password-change:'+Number(userId)]);
  return result.rowCount===1;
}
