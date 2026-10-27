import {STAFF_PHOTO_MAX_BYTES,STAFF_PHOTO_MESSAGE,STAFF_PHOTO_TYPES} from '../../shared/staffPhotoPolicy.js';
import {newStaffPasswordError} from '../../shared/staffPasswordPolicy.js';
export function staffPhotoFileError(file){return !file||!STAFF_PHOTO_TYPES.includes(file.type)||!file.size||file.size>STAFF_PHOTO_MAX_BYTES?STAFF_PHOTO_MESSAGE:'';}
export function staffPasswordFormError(body){return body.newPassword!==body.confirmPassword?'New passwords do not match.':newStaffPasswordError(body.newPassword);}
