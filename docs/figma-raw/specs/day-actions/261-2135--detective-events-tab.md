# Detective events tab

- id: `261:2135`
- type: FRAME
- section: Day Actions
- size: 390 x 844
- position: x 10280, y 5873

## Layout

- FRAME "Detective events tab"  390x844  radius=16
  fill: #000000
  - FRAME "Container"  358x542  layout=VERTICAL  gap=32
    - FRAME "Nav"  358x24  layout=HORIZONTAL  gap=118
      - FRAME "Frame 28"  148x16  layout=HORIZONTAL  gap=12
        - TEXT "Night 🌙"  62x16
          text: "Night 🌙"
          font: Grandstander / Grandstander-Regular 16px w400 lh auto
          fill: #FFFFFF
        - LINE "Line 5"  0x16
          stroke: #FFFFFF 1px
        - TEXT "Round 4"  62x16
          text: "Round 4"
          font: Grandstander / Grandstander-Regular 16px w400 lh auto
          fill: #FFFFFF
      - FRAME "Frame 7"  149x24  layout=HORIZONTAL  gap=12
        - FRAME "Frame 6"  77x17  layout=HORIZONTAL  gap=4
          - TEXT "Code"  34x17  opacity=50%
            text: "Code"
            font: Helvetica Neue / HelveticaNeue 14px w400 lh auto
            fill: #FFFFFF
          - TEXT "E92G"  39x12
            text: "E92G"
            font: Grandstander / Grandstander-Regular 18px w400 lh auto
            fill: #FF6C02
        - FRAME "icon"  24x24
          - VECTOR "Vector"  0.98x0.98
          - VECTOR "Vector"  22x18
            fill: #FFFFFF
            stroke: #FFFFFF 1px
        - INSTANCE "Settings"  24x24  instance of `42:808` "Settings"
          - VECTOR "Icon"  22x22
            stroke: #FFFFFF 2.5px
    - INSTANCE "Membership Card"  357x222  radius=16  instance of `88:1051` "Role=Detective" of set "Membership Card"
      fill: GRADIENT_LINEAR #000000 -> #F9F9B4
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - TEXT "Your role is"  86x16
        text: "Your role is"
        font: Grandstander / Grandstander-Regular 16px w400 lh auto
        fill: #FFFFFF
      - TEXT "Detective"  217x48
        text: "Detective"
        font: Grandstander / Grandstander-Black 48px w900 lh auto
        fill: #FFFFFF
      - TEXT "Investigate players to find the hiding mafia"  266x12
        text: "Investigate players to find the hiding mafia"
        font: Grandstander / Grandstander-Regular 12px w400 lh auto
        fill: #FFFFFF
      - RECTANGLE "image 1"  78x78
        fill: image fill ref=469ed27d0871335a640e9f0b3152a2600f14392f
    - TEXT "Dawn breaks. The town wakes to find mo dead in the square."  358x36
      text: "Dawn breaks. The town wakes to find mo dead in the square."
      font: Grandstander / Grandstander-Italic 18px w400 lh 18px
      fill: #FFFFFF
    - FRAME "Events / Players"  358x164  layout=VERTICAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - INSTANCE "Tabs"  326x30  layout=HORIZONTAL  gap=16  instance of `332:5464` "Toggle=Left" of set "Tabs"
        - FRAME "Official"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          fill: #FF6C02
          - TEXT "Events"  44x14
            text: "Events"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "House"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          - TEXT "Players"  49x14
            text: "Players"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
      - FRAME "Frame 9"  326x36  layout=HORIZONTAL  gap=10
        - TEXT "Round 1"  52x14
          text: "Round 1"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - FRAME "Frame 22"  184x36  layout=VERTICAL  gap=8
          - TEXT "kevin - died in the night"  166x14
            text: "kevin - died in the night"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - TEXT "mo - investigated as CLEAR"  184x14
            text: "mo - investigated as CLEAR"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
      - LINE "Line 2"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Frame 10"  326x36  layout=HORIZONTAL  gap=10
        - TEXT "Round 2"  53x14
          text: "Round 2"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - FRAME "Frame 22"  200x36  layout=VERTICAL  gap=8
          - TEXT "mo - saved by doctor"  144x14
            text: "mo - saved by doctor"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - TEXT "jenny - investigated as MAFIA"  200x14
            text: "jenny - investigated as MAFIA"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF

## Assets used

- `469ed27d0871335a640e9f0b3152a2600f14392f` -> assets/fills/469ed27d0871335a640e9f0b3152a2600f14392f.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `I332:5622;185:1610` | House | ON_CLICK | `332:5469` |
| `I332:5622;185:1610` | House | transitionNodeID | `332:5469` |
