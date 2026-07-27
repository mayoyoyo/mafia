# Death notification

- id: `264:2485`
- type: FRAME
- section: Day Actions
- size: 390 x 844
- position: x 8980, y 9032

## Layout

- FRAME "Death notification"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
    - TEXT "mo was"  358x24
      text: "mo was"
      font: Grandstander / Grandstander-Regular 24px w400 lh 24px
      fill: #FFFFFF
    - TEXT "EXECUTED"  358x48
      text: "EXECUTED"
      font: Grandstander / Grandstander-Black 48px w900 lh auto
      fill: #E53935
  - TEXT "The verdict"  358x24
    text: "The verdict"
    font: Grandstander / Grandstander-Regular 24px w400 lh 24px
    fill: #FFFFFF
  - FRAME "Skull"  244x245
    fill: GRADIENT_RADIAL #AA2222 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=b16599d8c2a12ed416260aa2f635829bab2f9798

## Assets used

- `b16599d8c2a12ed416260aa2f635829bab2f9798` -> assets/fills/b16599d8c2a12ed416260aa2f635829bab2f9798.png

## Wiring

_none_
