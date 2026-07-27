# Victory screen

- id: `332:5939`
- type: FRAME
- section: Game Over
- size: 390 x 844
- position: x 11960, y 4694

## Layout

- FRAME "Victory screen"  390x844  radius=16
  fill: #000000
  - FRAME "Before Text"  358x82  layout=VERTICAL  gap=24
    - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
      - TEXT "The final verdict"  358x24
        text: "The final verdict"
        font: Grandstander / Grandstander-Regular 24px w400 lh 24px
        fill: #FFFFFF
      - TEXT "Mafia Wins!"  358x48
        text: "Mafia Wins!"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #D18D83
  - FRAME "Before"  244x245
    fill: GRADIENT_RADIAL #D18D83 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=6252da56cc3d69ce983ec5aa7ba8be590e2665c9
  - FRAME "After Text"  358x151  layout=VERTICAL  gap=24  opacity=0%
    - FRAME "Frame 37"  358x82  layout=VERTICAL  gap=24
      - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
        - TEXT "The final verdict"  358x24
          text: "The final verdict"
          font: Grandstander / Grandstander-Regular 24px w400 lh 24px
          fill: #FFFFFF
        - TEXT "Mafia Wins!"  358x48
          text: "Mafia Wins!"
          font: Grandstander / Grandstander-Black 48px w900 lh auto
          fill: #D18D83
    - TEXT "It’s over. There aren’t enough honest hands left to hold the line. The lamp stays dark on whichever streets they choose. The Mafia wins."  358x45
      text: "It’s over. There aren’t enough honest hands left to hold the line. The lamp stays dark on whichever streets they choose. The Mafia wins."
      font: Grandstander / Grandstander-Regular 14px w400 lh 15.4px
      fill: #FFFFFF
  - FRAME "CTAs"  358x132  layout=VERTICAL  gap=12  opacity=0%
    - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #FF6C02
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "Return to lobby"  105x14
        text: "Return to lobby"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
    - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "View game details"  126x14
        text: "View game details"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
  - FRAME "After"  244x245  opacity=0%
    fill: GRADIENT_RADIAL #D18D83 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=6252da56cc3d69ce983ec5aa7ba8be590e2665c9

## Assets used

- `6252da56cc3d69ce983ec5aa7ba8be590e2665c9` -> assets/fills/6252da56cc3d69ce983ec5aa7ba8be590e2665c9.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `332:5939` | Victory screen | AFTER_TIMEOUT | `332:5960` |
| `332:5939` | Victory screen | transitionNodeID | `332:5960` |
| `332:5953` | CTA | ON_CLICK | `42:782` |
| `332:5953` | CTA | transitionNodeID | `42:782` |
