/**
 * Termos de uso e Política de privacidade, iguais no site e no app. Cada bloco é um parágrafo (texto) ou
 * uma lista (vários textos). Ao mudar o conteúdo, atualize `atualizadoEm`.
 */

export const EMAIL_CONTATO = '(e-mail a definir)';
/** Quem responde pelo Arroba Direta e pelos dados (o controlador, na LGPD). Vira a empresa quando houver CNPJ. */
export const RESPONSAVEL = 'Mateus Bonato';

export type BlocoLegal = string | string[];

export interface SecaoLegal {
  titulo: string;
  blocos: BlocoLegal[];
}

export interface DocumentoLegal {
  titulo: string;
  atualizadoEm: string;
  introducao: string;
  secoes: SecaoLegal[];
}

const CONTATO = `Dúvidas, pedidos e denúncias: ${EMAIL_CONTATO}.`;

export const TERMOS_DE_USO: DocumentoLegal = {
  titulo: 'Termos de uso',
  atualizadoEm: '27 de outubro de 2026',
  introducao:
    'Estes termos valem para o app e o site do Arroba Direta. Ao entrar com o seu celular, você concorda com eles e com a Política de privacidade.',
  secoes: [
    {
      titulo: '1. O que é o Arroba Direta',
      blocos: [
        `O Arroba Direta é um espaço de anúncios para pecuaristas comprarem e venderem gado direto entre si. O serviço é mantido por ${RESPONSAVEL}.`,
        'Nós não compramos, não vendemos e não intermediamos o gado. Não recebemos pagamentos e não fazemos parte do negócio entre comprador e vendedor. Também não garantimos que o lote existe, nem o peso, a idade, a raça, a saúde ou a documentação dos animais. Quem anuncia responde pelo que anuncia.',
      ],
    },
    {
      titulo: '2. Quem pode usar',
      blocos: [
        'Para entrar, você precisa ter 18 anos ou mais e usar um número de celular seu. A conta é ligada ao número: tudo o que for feito com ela é responsabilidade de quem tem o número.',
        'O código que chega por SMS é só seu. Não passe o código para ninguém: o Arroba Direta nunca pede o código por mensagem, ligação ou WhatsApp.',
      ],
    },
    {
      titulo: '3. Anúncios',
      blocos: [
        'Ao anunciar, você garante que:',
        [
          'o lote existe, está com você ou sob sua responsabilidade e está disponível para venda;',
          'as fotos e os vídeos são do próprio lote;',
          'as informações de categoria, raça, quantidade, peso, idade, local e preço são verdadeiras;',
          'os animais têm origem legal e a venda segue as regras sanitárias e de trânsito animal, como a GTA e as vacinas obrigatórias, além das obrigações fiscais.',
        ],
        'É proibido anunciar animais de origem ilegal ou sem a documentação exigida, animais silvestres, outros produtos, lotes que não existem e qualquer conteúdo enganoso ou ofensivo.',
      ],
    },
    {
      titulo: '4. Negociação, pagamento e entrega',
      blocos: [
        'A negociação, o pagamento, a pesagem, o transporte, a GTA e a entrega são combinados e feitos direto entre comprador e vendedor. A proposta registrada no app serve para anotar o que foi combinado; ela não é um pagamento nem uma garantia.',
        'Para se proteger de golpes:',
        [
          'veja o gado, pessoalmente ou por alguém de confiança, antes de pagar;',
          'desconfie de preço muito abaixo do mercado e de pressa para fechar;',
          'não pague adiantado a quem você não conhece e confira se a conta que recebe o pagamento é do vendedor;',
          'confira a GTA e os dados do vendedor antes do embarque.',
        ],
      ],
    },
    {
      titulo: '5. Seu telefone e o contato com outras pessoas',
      blocos: [
        'Quando você anuncia, o seu celular aparece no anúncio para quem entrou no app, para que o comprador possa ligar ou chamar no WhatsApp. Nas conversas do app, cada pessoa vê o celular da outra.',
        'Use os contatos que você recebe pelo Arroba Direta só para tratar do negócio. É proibido mandar propaganda, correntes ou mensagens ofensivas, e repassar esses números.',
      ],
    },
    {
      titulo: '6. Fotos, vídeos e textos que você envia',
      blocos: [
        'O que você envia continua sendo seu. Você nos autoriza, sem custo, a guardar, ajustar o tamanho e o formato e mostrar esse conteúdo no app e no site enquanto o anúncio ou a conversa existir.',
      ],
    },
    {
      titulo: '7. Denúncias e remoção',
      blocos: [
        'Podemos tirar do ar anúncios e mensagens e suspender contas que desrespeitem estes termos ou a lei, por denúncia ou por iniciativa nossa. Quando houver suspeita de golpe, isso pode acontecer sem aviso prévio. Podemos repassar informações às autoridades quando a lei exigir.',
      ],
    },
    {
      titulo: '8. Limites do serviço',
      blocos: [
        'O Arroba Direta pode ficar fora do ar por manutenção ou falha, e os recursos podem mudar. Dentro do que a lei permite, não respondemos por prejuízos que venham de negócios entre usuários, de informações falsas em anúncios ou de o serviço ficar fora do ar.',
      ],
    },
    {
      titulo: '9. Preço',
      blocos: [
        'Hoje o Arroba Direta é gratuito. Se surgirem recursos pagos, como destaque de anúncio ou planos, o preço e as condições aparecem antes de você contratar.',
      ],
    },
    {
      titulo: '10. Mudanças nestes termos e fim do uso',
      blocos: [
        'Quando estes termos mudarem, avisamos no app e mudamos a data no alto da página. Se continuar usando depois do aviso, você concorda com a nova versão.',
        `Você pode deixar de usar o Arroba Direta quando quiser e pedir que a sua conta seja apagada pelo e-mail ${EMAIL_CONTATO}.`,
      ],
    },
    {
      titulo: '11. Lei e foro',
      blocos: [
        'Estes termos seguem as leis do Brasil. Qualquer disputa será resolvida no foro da cidade onde você mora.',
        CONTATO,
      ],
    },
  ],
};

export const POLITICA_DE_PRIVACIDADE: DocumentoLegal = {
  titulo: 'Política de privacidade',
  atualizadoEm: '27 de outubro de 2026',
  introducao:
    'Esta política explica quais dados pessoais o Arroba Direta guarda, para quê, com quem eles são compartilhados e como você pode pedir para ver, corrigir ou apagar os seus dados, como manda a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).',
  secoes: [
    {
      titulo: '1. Quem cuida dos seus dados',
      blocos: [
        `O responsável pelos dados (o controlador, na LGPD) é ${RESPONSAVEL}, que mantém o Arroba Direta. Para qualquer assunto sobre os seus dados, escreva para ${EMAIL_CONTATO}.`,
      ],
    },
    {
      titulo: '2. Quais dados guardamos',
      blocos: [
        [
          'Conta: número do celular, nome, município e estado.',
          'Anúncios: os dados do lote (categoria, raça, quantidade, peso, idade, preço e descrição), o local do lote (município, estado e a posição aproximada no mapa) e as fotos e vídeos.',
          'Conversas e negócios: as mensagens, as propostas e os negócios fechados no app.',
          'Dados de acesso: o endereço IP, a data e a hora em que você entra e usa o app, e os pedidos de código de entrada.',
          'No seu aparelho: o app guarda uma chave de acesso para você não precisar entrar de novo a cada vez. Não usamos cookies de propaganda nem ferramentas que acompanham o que você faz em outros apps ou sites.',
        ],
      ],
    },
    {
      titulo: '3. Para que usamos',
      blocos: [
        [
          'Para o serviço funcionar: criar a sua conta, mandar o código de entrada por SMS, mostrar os anúncios e as conversas (execução do contrato, art. 7º, V, da LGPD).',
          'Para a segurança de todos: evitar golpes e abusos, limitar pedidos de código e analisar denúncias (legítimo interesse, art. 7º, IX).',
          'Para cumprir a lei: o Marco Civil da Internet (Lei 12.965/2014, art. 15) obriga a guardar os registros de acesso por 6 meses (cumprimento de obrigação legal, art. 7º, II).',
        ],
        'Não vendemos dados pessoais. Podemos usar números somados e anônimos, como preço médio por categoria e região, sem identificar ninguém, para estatísticas do mercado de gado.',
      ],
    },
    {
      titulo: '4. Quem vê os seus dados',
      blocos: [
        [
          'Outros usuários: os seus anúncios, o seu nome e o seu município aparecem para todos. O seu celular aparece nos seus anúncios para quem entrou no app, e nas conversas para a outra pessoa. As mensagens só aparecem para quem participa da conversa.',
          'Empresas que prestam serviço ao Arroba Direta e só usam os dados para isso: Render (servidores e banco de dados), Cloudflare (rede e proteção do site), Cloudinary (fotos e vídeos) e Comtele (envio do SMS).',
          'Autoridades: quando houver ordem judicial ou pedido feito como a lei manda.',
        ],
      ],
    },
    {
      titulo: '5. Dados fora do Brasil',
      blocos: [
        'Os servidores, o banco de dados e as fotos ficam com empresas que guardam os dados nos Estados Unidos. Essa transferência é necessária para o serviço funcionar (art. 33 da LGPD), e escolhemos empresas que adotam medidas de segurança reconhecidas.',
      ],
    },
    {
      titulo: '6. Por quanto tempo guardamos',
      blocos: [
        [
          'Conta, anúncios e conversas: enquanto a sua conta existir. Depois que você pedir para apagar a conta, apagamos ou tornamos anônimos esses dados em até 30 dias, exceto o que a lei mandar guardar.',
          'Registros de acesso e pedidos de código: 6 meses. Depois disso, são apagados.',
        ],
      ],
    },
    {
      titulo: '7. Segurança',
      blocos: [
        'A comunicação com o app e o site é protegida (HTTPS), o código de entrada não fica guardado como texto e o acesso aos dados é restrito. Nenhum sistema é totalmente seguro: se acontecer um incidente que possa trazer risco a você, avisaremos você e a Autoridade Nacional de Proteção de Dados (ANPD).',
      ],
    },
    {
      titulo: '8. Seus direitos',
      blocos: [
        'Pela LGPD (art. 18), você pode pedir a qualquer momento:',
        [
          'confirmação de que guardamos dados seus e uma cópia deles;',
          'correção de dados errados ou desatualizados;',
          'que dados desnecessários sejam apagados ou tornados anônimos;',
          'a portabilidade dos seus dados para outro serviço;',
          'informação sobre com quem compartilhamos os seus dados;',
          'que a sua conta e os seus dados sejam apagados.',
        ],
        `Faça o pedido pelo e-mail ${EMAIL_CONTATO}, do jeito que preferir. Respondemos em até 15 dias. Nome, município e estado você também pode corrigir direto no app, em Perfil. Se não ficar satisfeito, você pode reclamar à ANPD (www.gov.br/anpd).`,
      ],
    },
    {
      titulo: '9. Menores de idade',
      blocos: ['O Arroba Direta é só para maiores de 18 anos.'],
    },
    {
      titulo: '10. Mudanças nesta política',
      blocos: [
        'Quando esta política mudar, avisamos no app e mudamos a data no alto da página.',
        CONTATO,
      ],
    },
  ],
};
