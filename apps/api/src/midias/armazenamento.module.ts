import { Logger, Module } from '@nestjs/common';
import { ARMAZENAMENTO, type Armazenamento } from './armazenamento.js';
import { ArmazenamentoCloudinary } from './cloudinary.js';
import { CONFIG_MIDIA, lerConfigMidia, type ConfigMidia } from './config-midia.js';
import { ArmazenamentoLocal } from './local.js';

function criarArmazenamento(config: ConfigMidia): Armazenamento | null {
  const logger = new Logger('Midias');
  if (config.modo === 'cloudinary') {
    logger.log(`Fotos e vídeo no Cloudinary (conta ${config.cloudinary.cloudName}).`);
    return new ArmazenamentoCloudinary(config.cloudinary);
  }
  if (config.modo === 'local') {
    logger.log(`Fotos e vídeo na pasta ${config.local.pasta}, servidos em ${config.local.urlPublica}/arquivos.`);
    return new ArmazenamentoLocal(config.local);
  }
  logger.warn('Envio de fotos e vídeo desligado (MIDIA_ARMAZENAMENTO=desligado ou Render sem as credenciais do Cloudinary).');
  return null;
}

@Module({
  providers: [
    // Lido ao subir: com MIDIA_ARMAZENAMENTO ou credenciais do Cloudinary inválidas a API não inicia.
    { provide: CONFIG_MIDIA, useFactory: () => lerConfigMidia() },
    { provide: ARMAZENAMENTO, useFactory: criarArmazenamento, inject: [CONFIG_MIDIA] },
  ],
  exports: [CONFIG_MIDIA, ARMAZENAMENTO],
})
export class ArmazenamentoModule {}
