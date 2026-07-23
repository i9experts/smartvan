// /* eslint-disable prettier/prettier */
// import {
//   Controller,
//   Post,
//   UploadedFile,
//   UseInterceptors,
// } from '@nestjs/common';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { UploadService } from './upload.service';
// import { createMulterOptions } from './multer.config';
// import { ConfigService } from '@nestjs/config';

// @Controller('upload')
// export class UploadController {
//   constructor(
//     private readonly uploadService: UploadService,
//     private readonly configService: ConfigService,
//   ) {}

//   @Post('image')
//   @UseInterceptors(
//     FileInterceptor('file', createMulterOptions(new ConfigService())), // ✅ use CloudinaryStorage
//   )
//   async uploadImage(@UploadedFile() file: Express.Multer.File) {
//     return this.uploadService.uploadFile(file); // no need to upload again
//   }
// }


// upload.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { createMulterOptions } from './multer.config';
import { ConfigService } from '@nestjs/config';

@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('image')
@UseInterceptors(
  FileInterceptor('file', createMulterOptions(new ConfigService())), // ✅ safe
)
async uploadFile(@UploadedFile() file: Express.Multer.File) {
  if (!file) throw new Error('File is missing. Check Postman key!');
  return this.uploadService.uploadFile(file);
}
}