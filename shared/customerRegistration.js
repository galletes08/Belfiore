// Length guidance follows NIST SP 800-63B-4; bcrypt must never silently truncate.
export const PASSWORD_GUIDANCE='Use at least 15 characters. A unique passphrase works well. Spaces are allowed; maximum 72 UTF-8 bytes.';
const common=new Set(['passwordpassword','password123456789','123456789012345','1234567890123456','qwertyuiopasdfgh','belfiorepassword','belfiore123456789','letmeinletmeinletmein','iloveyouiloveyou']);
export function customerPasswordError(password) {
  if(typeof password!=='string'||Array.from(password).length<15)return 'Use at least 15 characters.';
  if(new TextEncoder().encode(password).length>72)return 'Password must not exceed 72 UTF-8 bytes.';
  if(common.has(password.toLowerCase())||/^(.)\1+$/u.test(password))return 'Choose a less predictable password or a unique passphrase.';
  return '';
}
export function registrationErrors(body={}) {
  const errors={};
  for(const field of ['firstName','lastName'])if(typeof body[field]!=='string'||!body[field].trim()||body[field].trim().length>100)errors[field]='Enter a name between 1 and 100 characters.';
  if(typeof body.email!=='string'||body.email.trim().length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))errors.email='Enter a valid email address.';
  const problem=customerPasswordError(body.password);if(problem)errors.password=problem;
  if(typeof body.confirmPassword!=='string'||body.password!==body.confirmPassword)errors.confirmPassword='Passwords must match.';
  return errors;
}
