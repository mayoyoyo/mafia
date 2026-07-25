# Game options

- id: `278:2780`
- type: FRAME
- section: Game Over
- size: 390 x 844
- position: x 12610, y 3641

## Layout

- FRAME "Game options"  390x844  radius=16
  fill: #000000
  - FRAME "Before Text"  358x82  layout=VERTICAL  gap=24  opacity=0%
    - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
      - TEXT "The final verdict"  358x24
        text: "The final verdict"
        font: Grandstander / Grandstander-Regular 24px w400 lh 24px
        fill: #FFFFFF
      - TEXT "Citizens Win!"  358x48
        text: "Citizens Win!"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #E3DAB5
  - FRAME "Before"  244x245  opacity=0%
    fill: GRADIENT_RADIAL #E3DAB5 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=c902a3b3d46083910bbe4456df8c6578df605dac
  - FRAME "After Text"  358x151  layout=VERTICAL  gap=24
    - FRAME "Frame 37"  358x82  layout=VERTICAL  gap=24
      - FRAME "Frame 35"  358x82  layout=VERTICAL  gap=10
        - TEXT "The final verdict"  358x24
          text: "The final verdict"
          font: Grandstander / Grandstander-Regular 24px w400 lh 24px
          fill: #FFFFFF
        - TEXT "Citizens Win!"  358x48
          text: "Citizens Win!"
          font: Grandstander / Grandstander-Black 48px w900 lh auto
          fill: #E3DAB5
    - TEXT "The last of the mafia falls. The street lamps come on early, and for the first time in a long time, no one is afraid to walk under them. The town wins."  358x45
      text: "The last of the mafia falls. The street lamps come on early, and for the first time in a long time, no one is afraid to walk under them. The town wins. "
      font: Grandstander / Grandstander-Regular 14px w400 lh 15.4px
      fill: #FFFFFF
  - FRAME "CTAs"  358x132  layout=VERTICAL  gap=12
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
  - FRAME "After"  244x245
    fill: GRADIENT_RADIAL #E3CBB5 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  200x200
      fill: image fill ref=c902a3b3d46083910bbe4456df8c6578df605dac

## Assets used

- `c902a3b3d46083910bbe4456df8c6578df605dac` -> assets/fills/c902a3b3d46083910bbe4456df8c6578df605dac.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `278:2805` | CTA | ON_CLICK | `42:782` |
| `278:2805` | CTA | transitionNodeID | `42:782` |
| `278:2807` | CTA | ON_CLICK | `278:2810` |
| `278:2807` | CTA | transitionNodeID | `278:2810` |
