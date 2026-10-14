# Sinuquinha — sinuca 3D no navegador

Jogo de sinuca 3D jogável no Chrome, Edge e Firefox, sem instalar engine. Quatro modalidades com regras próprias, física em passos fixos, adversário por computador e interface para mouse e toque.

## Tecnologias

- HTML5, CSS3 e JavaScript (módulos ES)
- [Three.js](https://threejs.org/) para WebGL
- [cannon-es](https://github.com/pmndrs/cannon-es) para colisões, atrito e rotação
- LocalStorage para configurações e estatísticas
- Web Audio API para efeitos e trilha sintetizados (sem amostras protegidas)

Versões em `package.json`. Após `npm install`, as bibliotecas ficam em `node_modules` e o jogo pode ser empacotado com `npm run build` para uso local.

## Como executar

Precisa de [Node.js 18+](https://nodejs.org/).

```bash
cd sinuca-3d
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (em geral `http://localhost:5173`).

Testes das regras:

```bash
npm test
```

Build estático para publicar (Netlify, GitHub Pages, pasta `dist` em qualquer hospedagem HTTPS):

```bash
npm run build
npm run preview
```

## Modalidades e regras adotadas

### Bola 8

Adaptação inspirada na WPA: 15 bolas + branca; 1 na ponta do triângulo, 8 no centro, lisa e listrada nos cantos de trás. Mesa aberta na abertura. Grupos definidos na primeira bola legalmente encaçapada de um único tipo **depois** do break. Vitória só com a 8 legal após limpar o grupo. 8 ilegal perde. 8 na abertura volta ao ponto (falta, sem derrota automática). Falta: bola na mão.

### Par ou Ímpar

Pares `2,4,6,8,10,12,14` (7) e ímpares `1,3,5,7,9,11,13,15` (8). A diferença é intencional: quem fica com os pares precisa de menos bolas. A categoria do jogador 1 é escolhida no menu. Vitória ao encaçapar todas as da própria categoria.

### Bolinho

Variante de bar **deste jogo** (não há um único regulamento nacional): padrão com 8 bolas numeradas. Qualquer um pode encaçapar 1–7 (1 ponto cada). A 8 (o bolinho) só vale depois que 1–7 saíram; quem a encaixa legalmente vence. Quantidade de bolas configurável no início (8, 9 ou 15). Independente das outras modalidades.

### 3 Bolas

Uma branca e três bolas objetivas (1, 2 e 3). Vence quem encaçapar a última das três. Se uma tacada não tocar em nenhuma bola objetiva, o adversário vence a partida; se tocar e não encaçapar, a vez passa.

## Controles

**Computador:** segure o botão esquerdo e arraste na horizontal para girar a mira; puxe para trás para definir a força e empurre para frente para tacar. Soltar depois de puxar também executa a tacada. A barra de força e o botão Tacada continuam disponíveis. A/D ajusta a mira, W/S a força, Espaço executa a tacada, setas movimentam a câmera, Q/E ajusta o zoom, C alterna o ângulo, R reinicia a câmera e Esc pausa. Na bola na mão, clique no pano para posicionar e confirmar automaticamente; pelo teclado, use as setas e Enter.

**Celular/tablet:** arrastar para mirar; slider de força; botão grande de tacada; botões de câmera. Gestos de zoom do navegador estão bloqueados no canvas (`touch-action: none` e `user-scalable=no`).

## Estatísticas

Ficam só neste navegador, via LocalStorage. Não são enviadas nem sincronizadas entre aparelhos.

## Estrutura

Veja `js/` (cena, física, taco, modos, IA, áudio, interface) e `tests/modes.test.js`.
