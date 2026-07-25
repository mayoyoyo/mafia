# Active room code

- id: `287:3259`
- type: FRAME
- section: Game Menu
- size: 390 x 844
- position: x 1300, y 3705

## Layout

- FRAME "Active room code"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 2"  358x264  layout=VERTICAL  gap=24
    - FRAME "Frame 4"  358x24  layout=HORIZONTAL  gap=118
      - TEXT "Welcome, mo"  152x24
        text: "Welcome, mo"
        font: Grandstander / Grandstander-Regular 24px w400 lh auto
        fill: #FFFFFF
      - TEXT "Log out"  48x17  opacity=50%
        text: "Log out"
        font: Helvetica Neue / HelveticaNeue 14px w400 lh auto
        fill: #FFFFFF
    - FRAME "Pin"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      - TEXT "E92G"  35x17
        text: "E92G"
        font: Helvetica Neue / HelveticaNeue 14px w400 lh auto
        fill: #FFFFFF
    - FRAME "Frame 3"  358x132  layout=VERTICAL  gap=12
      - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #FF6C02
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "Join"  31x14
          text: "Join"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #232729
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "Host game"  73x14
          text: "Host game"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
  - TEXT "MAFIA"  122x48
    text: "MAFIA"
    font: Grandstander / Grandstander-Regular 48px w400 lh auto
    fill: #FFFFFF
  - FRAME "Skull"  244x245
    fill: GRADIENT_RADIAL #218BE1 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=e721e25818db0cf44d23ba66f5720bb5dc2c04a7

## Assets used

- `e721e25818db0cf44d23ba66f5720bb5dc2c04a7` -> assets/fills/e721e25818db0cf44d23ba66f5720bb5dc2c04a7.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `287:3267` | CTA | ON_CLICK | `42:782` |
| `287:3267` | CTA | transitionNodeID | `42:782` |
| `287:3269` | CTA | ON_CLICK | `45:466` |
| `287:3269` | CTA | transitionNodeID | `45:466` |
