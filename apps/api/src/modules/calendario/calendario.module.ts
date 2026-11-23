import {
  CalendarPublicationController,
  CalendarPublicationGuard,
} from './calendar-publication.controller.js';
import {
  CalendarPolicyProvider,
  CalendarPublicationService,
} from './calendar-publication.service.js';
import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import {
  CalendarController,
  CalendarSimulationGuard,
} from './calendar.controller.js';
import { CalendarSourceRepository } from './calendar-source.repository.js';
import { CalendarSimulationService } from './calendar-simulation.service.js';
@Module({
  imports: [IamModule],
  controllers: [CalendarController, CalendarPublicationController],
  providers: [
    CalendarPublicationGuard,
    CalendarPolicyProvider,
    CalendarPublicationService,
    CalendarSourceRepository,
    CalendarSimulationService,
    CalendarSimulationGuard,
  ],
})
export class CalendarioModule {}
