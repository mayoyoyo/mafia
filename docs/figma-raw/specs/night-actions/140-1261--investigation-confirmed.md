# Investigation Confirmed

- id: `140:1261`
- type: FRAME
- section: Night Actions
- size: 390 x 844
- position: x 4700, y 10005

## Layout

- FRAME "Investigation Confirmed"  390x844  radius=16
  fill: #000000
  - FRAME "Container"  358x722  layout=VERTICAL  gap=32
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
    - TEXT "A player has been chosen – Results will appear in the morning"  358x72
      text: "A player has been chosen –\nResults will appear in the morning"
      font: Grandstander / Grandstander-Regular 24px w400 lh 24px
      fill: #FFFFFF
    - FRAME "Players"  358x70  layout=VERTICAL  gap=10  pad=0/16/0/16  radius=16
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "CTA"  326x70  layout=HORIZONTAL  gap=10  pad=16  radius=16
        fill: #232729
        effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
        - TEXT "jenny"  39x14
          text: "jenny"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
    - FRAME "Events / Players"  358x206  layout=VERTICAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - INSTANCE "Tabs"  326x30  layout=HORIZONTAL  gap=16  instance of `185:1614` "Toggle=Right" of set "Tabs"
        - FRAME "Official"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          - TEXT "Events"  44x14
            text: "Events"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
        - FRAME "House"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
          fill: #FF6C02
          - TEXT "Players"  49x14
            text: "Players"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
      - FRAME "Frame 10"  326x14  layout=HORIZONTAL  gap=10  opacity=30%
        - TEXT "dale"  30x14
          text: "dale"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #E53935
      - FRAME "Frame 15"  326x14  layout=HORIZONTAL  gap=10
        - FRAME "Frame 32"  40x14  layout=HORIZONTAL  gap=4
          - TEXT "mo"  22x14
            text: "mo"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Thumbs"  14x14  instance of `225:916` "Thumb=Thumbs up, Size=Small" of set "Thumbs"
            - RECTANGLE "1F44D_ThumbsUp_1024px_01_07_Yellow 2"  14x14
              fill: image fill ref=b7bdd4e332f1134cea6b347137499723925005ef
        - ELLIPSE "Ellipse 16"  14x14
          fill: #AB47BC
      - FRAME "Frame 11"  326x14  layout=HORIZONTAL  gap=10
        - FRAME "Frame 32"  57x14  layout=HORIZONTAL  gap=4
          - TEXT "jenny"  39x14
            text: "jenny"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Thumbs"  14x14  instance of `225:917` "Thumb=Thumbs down, Size=Small" of set "Thumbs"
            - RECTANGLE "1F44E_ThumbsDown_1024px_01_05_Yellow 1"  14x14
              fill: image fill ref=6d85ad43073beaab687995d7c049a1701e91bebb
        - ELLIPSE "Ellipse 16"  14x14
          fill: #218BE1
      - FRAME "Frame 12"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "kevin"  37x14
          text: "kevin"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #546E7A
      - FRAME "Frame 13"  326x14  layout=HORIZONTAL  gap=10  opacity=30%
        - TEXT "natasha"  57x14
          text: "natasha"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #66BB6A
      - FRAME "Frame 14"  326x14  layout=HORIZONTAL  gap=10
        - FRAME "Frame 32"  95x14  layout=HORIZONTAL  gap=4
          - TEXT "christopher"  77x14
            text: "christopher"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Thumbs"  14x14  instance of `225:917` "Thumb=Thumbs down, Size=Small" of set "Thumbs"
            - RECTANGLE "1F44E_ThumbsDown_1024px_01_05_Yellow 1"  14x14
              fill: image fill ref=6d85ad43073beaab687995d7c049a1701e91bebb
        - ELLIPSE "Ellipse 16"  14x14
          fill: #FFEE58

## Assets used

- `469ed27d0871335a640e9f0b3152a2600f14392f` -> assets/fills/469ed27d0871335a640e9f0b3152a2600f14392f.png
- `6d85ad43073beaab687995d7c049a1701e91bebb` -> assets/fills/6d85ad43073beaab687995d7c049a1701e91bebb.png
- `b7bdd4e332f1134cea6b347137499723925005ef` -> assets/fills/b7bdd4e332f1134cea6b347137499723925005ef.png

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `I287:4447;185:1615` | Official | ON_CLICK | `185:1612` |
| `I287:4447;185:1615` | Official | transitionNodeID | `185:1612` |
