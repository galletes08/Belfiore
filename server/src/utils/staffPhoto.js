import sharp from 'sharp';
import {STAFF_PHOTO_MAX_BYTES,STAFF_PHOTO_MESSAGE,STAFF_PHOTO_TYPES} from '../../../shared/staffPhotoPolicy.js';

export async function normalizeStaffPhoto(file){
 if(!file?.buffer||!file.buffer.length||file.buffer.length>STAFF_PHOTO_MAX_BYTES||!STAFF_PHOTO_TYPES.includes(file.mimetype))throw Object.assign(new Error(STAFF_PHOTO_MESSAGE),{status:400});
 try{
  const image=sharp(file.buffer,{limitInputPixels:16000000,failOn:'warning'});
  const meta=await image.metadata();
  const types={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
  if(types[meta.format]!==file.mimetype||!types[meta.format]||(meta.pages||1)!==1)throw Error('Unsupported image');
  // Fully decode, orient and re-encode. Do not retain EXIF, scripts or original filenames.
  return await image.rotate().resize(512,512,{fit:'cover',position:'centre'}).flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();
 }catch{throw Object.assign(new Error('This image is invalid or damaged. '+STAFF_PHOTO_MESSAGE),{status:400});}
}
