# Returning User

- id: `42:766`
- type: FRAME
- section: Game Menu
- size: 390 x 844
- position: x 650, y 3705

## Layout

- FRAME "Returning User"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 2"  358x305  layout=VERTICAL  gap=24
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
      - TEXT "4 Digit Pin"  65x17  opacity=50%
        text: "4 Digit Pin"
        font: Helvetica Neue / HelveticaNeue 14px w400 lh auto
        fill: #FFFFFF
    - FRAME "Frame 3"  358x132  layout=VERTICAL  gap=12
      - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #A0A0A0
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
    - TEXT "Enter a valid code"  113x17
      text: "Enter a valid code"
      font: Helvetica Neue / HelveticaNeue 14px w400 lh auto
      fill: #E53935
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
| `287:3251` | Pin | ON_CLICK | `287:3259` |
| `287:3251` | Pin | transitionNodeID | `287:3259` |
| `42:770` | Log out | ON_CLICK | `42:678` |
| `42:770` | Log out | transitionNodeID | `42:678` |
