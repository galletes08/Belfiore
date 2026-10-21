export function newStaffPasswordError(password) {
  if(typeof password!=='string'||[...password].length<15||[...password].length>64||new TextEncoder().encode(password).length>72)
    return 'Use 15–64 characters, up to 72 UTF-8 bytes. A unique passphrase is recommended.';
  if(['password123456789','123456789012345','qwertyuiopasdfgh','belfiore12345678'].includes(password.toLowerCase())||/^(.)\1+$/u.test(password))
    return 'Choose a less predictable, unique passphrase.';
  return '';
}
