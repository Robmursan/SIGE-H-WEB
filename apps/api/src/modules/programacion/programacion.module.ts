import { Module } from '@nestjs/common';
import { LecturasModule } from '../lecturas/lecturas.module.js';
import { ProgramacionController } from './programacion.controller.js';
@Module({ imports: [LecturasModule], controllers: [ProgramacionController] })
export class ProgramacionModule {}
