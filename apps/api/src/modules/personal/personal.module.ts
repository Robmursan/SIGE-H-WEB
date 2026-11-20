import { Module } from '@nestjs/common';
import { LecturasModule } from '../lecturas/lecturas.module.js';
import { PersonalController } from './personal.controller.js';
@Module({ imports: [LecturasModule], controllers: [PersonalController] })
export class PersonalModule {}
