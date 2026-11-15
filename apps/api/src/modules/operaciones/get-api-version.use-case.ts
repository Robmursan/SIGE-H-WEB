import { Injectable } from '@nestjs/common';
import { API_CONTRACT } from '../../config/api-contract.js';
import { ApiVersionResponseDto } from './dto/api-version-response.dto.js';

@Injectable()
export class GetApiVersionUseCase {
  execute(): ApiVersionResponseDto {
    return {
      apiVersion: API_CONTRACT.version,
      apiBasePath: `/${API_CONTRACT.globalPrefix}`,
    };
  }
}
