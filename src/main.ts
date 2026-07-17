/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const config = new DocumentBuilder()
    .setTitle('SmartVan API')
    .setDescription('SmartVan API')
    .addBearerAuth(
      {
        in: 'Header',
        scheme: 'Bearer',
        name: 'Authorization',
        type: 'http',
        bearerFormat: 'JWT',
      },
      'accessToken',
    )
    .build();

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept','Origin'],
    exposedHeaders: ['Content-Length','X-Request-Id'],
  });

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  // Railway (and most PaaS hosts) assign the port dynamically via process.env.PORT.
  // Falls back to 3002 for local/VPS dev where nothing sets PORT.
  const port = process.env.PORT ? Number(process.env.PORT) : 3002;
  await app.listen(port, '0.0.0.0');
  console.log(`Server running on http://0.0.0.0:${port}`);
}
bootstrap();
