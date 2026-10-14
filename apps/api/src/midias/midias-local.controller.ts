import {
  BadRequestException,
  Catch,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ArgumentsHost,
  type CanActivate,
  type ExceptionFilter,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ARMAZENAMENTO, type Armazenamento } from './armazenamento.js';
import { capaVideoPng } from './arquivo-midia.js';
import { ArmazenamentoLocal, type ArquivoRecebido } from './local.js';

/** As rotas do modo local só existem com MIDIA_ARMAZENAMENTO=local. */
@Injectable()
export class ModoLocalGuard implements CanActivate {
  constructor(@Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento | null) {}

  canActivate(): boolean {
    if (!(this.armazenamento instanceof ArmazenamentoLocal)) throw new NotFoundException({ mensagem: 'Não encontrado.' });
    return true;
  }
}

/** Erros do multer e do envio sempre como {mensagem}, como os do resto da API. */
@Catch()
export class ErroEnvioLocalFilter implements ExceptionFilter {
  catch(erro: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    if (erro instanceof HttpException) {
      const corpo = erro.getResponse();
      if (typeof corpo === 'object' && corpo !== null && 'mensagem' in corpo) {
        return res.status(erro.getStatus()).json(corpo);
      }
      if (erro.getStatus() === 413) {
        return res.status(400).json({ mensagem: 'O arquivo passa do tamanho permitido.' });
      }
    }
    res.status(400).json({ mensagem: 'Envio inválido. Tente de novo.' });
  }
}

/** Imita o Cloudinary em desenvolvimento e testes: recebe o envio e serve os arquivos. */
@Controller()
@UseGuards(ModoLocalGuard)
export class MidiasLocalController {
  constructor(@Inject(ARMAZENAMENTO) private readonly armazenamento: ArmazenamentoLocal) {}

  /** Os campos do ticket precisam vir antes do arquivo no formulário. */
  @Post('midias/local')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(ErroEnvioLocalFilter)
  receber(@UploadedFile() arquivo?: ArquivoRecebido) {
    if (!arquivo?.publicId) throw new BadRequestException({ mensagem: 'Envie o arquivo no campo "file".' });
    return this.armazenamento.respostaEnvio(arquivo);
  }

  @Get('midias/local/capa-video.png')
  capaVideo(@Res() res: Response) {
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(capaVideoPng());
  }

  @Get('arquivos/*caminho')
  servir(@Param('caminho') caminho: string | string[], @Res() res: Response) {
    const naoAchou = () => {
      if (!res.headersSent) res.status(404).json({ mensagem: 'Arquivo não encontrado.' });
    };
    const arquivo = this.armazenamento.caminhoPublico(Array.isArray(caminho) ? caminho : caminho.split('/'));
    if (!arquivo) return naoAchou();
    res.sendFile(
      arquivo,
      { dotfiles: 'deny', maxAge: '365d', immutable: true, headers: { 'X-Content-Type-Options': 'nosniff' } },
      (erro) => {
        if (erro) naoAchou();
      },
    );
  }
}
