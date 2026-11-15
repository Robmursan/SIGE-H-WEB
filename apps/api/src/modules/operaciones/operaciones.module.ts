import { Module } from '@nestjs/common';
import { GetApiVersionUseCase } from './get-api-version.use-case.js';
import { OperacionesController } from './operaciones.controller.js';

@Module({
  controllers: [OperacionesController],
  providers: [GetApiVersionUseCase],
})
export class OperacionesModule {}
