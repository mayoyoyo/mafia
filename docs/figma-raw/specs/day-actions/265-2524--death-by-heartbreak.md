# Death by heartbreak

- id: `265:2524`
- type: FRAME
- section: Day Actions
- size: 390 x 844
- position: x 8330, y 10085

## Layout

- FRAME "Death by heartbreak"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 37"  358x144  layout=VERTICAL  gap=24
    - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
      - TEXT "You died of"  358x24
        text: "You died of"
        font: Grandstander / Grandstander-Regular 24px w400 lh 24px
        fill: #FFFFFF
      - TEXT "HEARTBREAK"  358x48
        text: "HEARTBREAK"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #E53935
    - FRAME "Frame 36"  330x38  layout=VERTICAL  gap=10
      - TEXT "Your lover falls and your heart splits into two"  330x14
        text: "Your lover falls and your heart splits into two"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - TEXT "Stay quiet, you can still watch the town squirm."  330x14  opacity=60%
        text: "Stay quiet, you can still watch the town squirm."
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
  - FRAME "Skull"  244x245
    fill: GRADIENT_RADIAL #AA2222 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=142227b5913573f6b6385854d980edc3fd06ecb9
  - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
    fill: #FF6C02
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Watch the town"  105x14
      text: "Watch the town"
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF

## Assets used

- `142227b5913573f6b6385854d980edc3fd06ecb9` -> assets/fills/142227b5913573f6b6385854d980edc3fd06ecb9.png

## Wiring

_none_
