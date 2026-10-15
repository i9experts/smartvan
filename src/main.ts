/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
async function bootstrap() {
  // rawBody: true is required for Stripe webhook signature verification
  // (billing.controller.ts's `webhook` route reads req.rawBody) — without
  // it, req.rawBody is always undefined and every webhook call fails
  // signature verification before even checking the real signature, so
  // Stripe events (checkout.session.completed, invoice.payment_succeeded,
  // etc) never update a school's subscription status even though the
  // payment itself succeeded on Stripe's side.
  const app = await NestFactory.create(AppModule, { rawBody: true });
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