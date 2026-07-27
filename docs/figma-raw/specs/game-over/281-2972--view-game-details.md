# View game details

- id: `281:2972`
- type: FRAME
- section: Game Over
- size: 390 x 844
- position: x 13260, y 4694

## Layout

- FRAME "View game details"  390x844  radius=16
  fill: #000000
  - FRAME "Frame 37"  268.5x61.5  layout=VERTICAL  gap=18
    - FRAME "Frame 37"  268.5x61.5  layout=VERTICAL  gap=18
      - FRAME "Frame 35"  268.5x61.5  layout=VERTICAL  gap=7.5
        - TEXT "The final verdict"  268.5x18
          text: "The final verdict"
          font: Grandstander / Grandstander-Regular 18px w400 lh 18px
          fill: #FFFFFF
        - TEXT "Mafia Wins!"  268.5x36
          text: "Mafia Wins!"
          font: Grandstander / Grandstander-Black 36px w900 lh auto
          fill: #D18D83
  - FRAME "Skull"  183x183.75
    fill: GRADIENT_RADIAL #D18D83 @ 60% -> #000000 @ 60%
    - RECTANGLE "image 8"  150x150
      fill: image fill ref=6252da56cc3d69ce983ec5aa7ba8be590e2665c9
  - FRAME "Players"  358x550  layout=VERTICAL  gap=10  pad=0/16/0/16  radius=16
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "dale"  30x14
        text: "dale"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Frame 40"  88x30  layout=HORIZONTAL  gap=8
        - INSTANCE "Heart"  16x16  instance of `256:472` "Size=16" of set "Heart"
          - VECTOR "Icon"  13.94x12.15
            stroke: #FFFFFF 1.6px
        - FRAME "Female"  64x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          fill: #CDB198
          - TEXT "Citizen"  48x14
            text: "Citizen"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #67401E
    - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "jenny"  39x14
        text: "jenny"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Female"  54x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #DC998F
        - TEXT "Mafia"  38x14
          text: "Mafia"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #67281E
    - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "kevin"  37x14
        text: "kevin"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Tag"  103x30  layout=HORIZONTAL  gap=8
        - INSTANCE "Heart"  16x16  instance of `256:472` "Size=16" of set "Heart"
          - VECTOR "Icon"  13.94x12.15
            stroke: #FFFFFF 1.6px
        - FRAME "Tag"  79x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          fill: #F9F9B4
          - TEXT "Detective"  63x14
            text: "Detective"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #93791D
    - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "natasha"  57x14
        text: "natasha"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Tag"  61x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #B3D1D6
        - TEXT "Doctor"  45x14
          text: "Doctor"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #1E5C67
    - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "andrew"  52x14
        text: "andrew"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Female"  64x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #CDB198
        - TEXT "Citizen"  48x14
          text: "Citizen"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #67401E
    - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "andrea"  22x14
        text: "mo"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Female"  54x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #DC998F
        - TEXT "Mafia"  38x14
          text: "Mafia"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #67281E
    - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
      fill: #232729
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "hanson"  51x14
        text: "hanson"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #FFFFFF
      - FRAME "Tag"  61x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
        fill: #A9B8A4
        - TEXT "Hunter"  45x14
          text: "Hunter"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #204B12
  - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
    fill: #FF6C02
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Return to lobby"  105x14
      text: "Return to lobby"
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF

## Assets used

- `6252da56cc3d69ce983ec5aa7ba8be590e2665c9` -> assets/fills/6252da56cc3d69ce983ec5aa7ba8be590e2665c9.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `281:3015` | CTA | ON_CLICK | `42:782` |
| `281:3015` | CTA | transitionNodeID | `42:782` |
