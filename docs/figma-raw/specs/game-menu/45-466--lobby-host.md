# Lobby / Host

- id: `45:466`
- type: FRAME
- section: Game Menu
- size: 390 x 844
- position: x 1300, y 5769

## Layout

- FRAME "Lobby / Host"  390x844  radius=16
  fill: #000000
  - FRAME "Container"  358x1356  layout=VERTICAL  gap=32
    - FRAME "Nav"  358x24  layout=HORIZONTAL  gap=118
      - TEXT "Lobby"  45x16
        text: "Lobby"
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
    - TEXT "Choose how to play"  358x24
      text: "Choose how to play"
      font: Grandstander / Grandstander-Regular 24px w400 lh auto
      fill: #FFFFFF
    - FRAME "Lobby rules"  358x537  layout=VERTICAL  pad=8/16/8/16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x48  layout=HORIZONTAL  gap=10  pad=8/0/8/0
        stroke: #FFFFFF 1px
        - TEXT "Mafia members"  105x14
          text: "Mafia members"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - FRAME "Frame 20"  97x32  layout=HORIZONTAL  gap=12
          - INSTANCE "Minus circle"  32x32  instance of `47:159` "Minus circle"
            - VECTOR "Icon"  26.67x26.67
              stroke: #FFFFFF 3px
          - TEXT "2"  9x18
            text: "2"
            font: Grandstander / Grandstander-Regular 18px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Plus circle"  32x32  instance of `47:162` "Plus circle"
            - VECTOR "Icon"  26.67x26.67
              stroke: #FFFFFF 3px
      - INSTANCE "Role Toggle"  326x111  layout=VERTICAL  gap=8  pad=8/0/8/0  instance of `55:216` "Toggle=On" of set "Role Toggle"
        stroke: #FFFFFF 1px
        - FRAME "Toggle"  326x31  layout=HORIZONTAL  gap=230
          - TEXT "Doctor"  45x14
            text: "Doctor"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Toggle"  51x31  radius=100  instance of `69:263` "State=On" of set "Toggle"
            fill: #34C759
            - FRAME "Knob"  27x27  radius=100
              fill: #FFFFFF
              effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
              effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
              effect: DROP_SHADOW r0 #000000 @ 4%
        - FRAME "Rules Container"  326x56  layout=VERTICAL
          - INSTANCE "Rules"  326x56  layout=VERTICAL  gap=10  pad=0/0/4/0  instance of `55:137` "Rules=Official" of set "Rules"
            - FRAME "Rules"  326x30  layout=HORIZONTAL  gap=16
              - FRAME "Official"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
                fill: #FF6C02
                ...instance internals truncated
              - FRAME "House"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
                ...instance internals truncated
            - TEXT "Save is secret – only victim is notified"  326x12  opacity=50%
              text: "Save is secret – only victim is notified"
              font: Helvetica Neue / HelveticaNeue 10px w400 lh auto
              fill: #FFFFFF
      - FRAME "Detective"  326x47  layout=HORIZONTAL  gap=10  pad=8/0/8/0
        stroke: #FFFFFF 1px
        - TEXT "Detective"  63x14
          text: "Detective"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - INSTANCE "Toggle"  51x31  radius=100  instance of `69:263` "State=On" of set "Toggle"
          fill: #34C759
          - FRAME "Knob"  27x27  radius=100
            fill: #FFFFFF
            effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
            effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
            effect: DROP_SHADOW r0 #000000 @ 4%
      - INSTANCE "Role Toggle"  326x111  layout=VERTICAL  gap=8  pad=8/0/8/0  instance of `55:216` "Toggle=On" of set "Role Toggle"
        stroke: #FFFFFF 1px
        - FRAME "Toggle"  326x31  layout=HORIZONTAL  gap=230
          - TEXT "Doctor"  38x14
            text: "Joker"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Toggle"  51x31  radius=100  instance of `69:263` "State=On" of set "Toggle"
            fill: #34C759
            - FRAME "Knob"  27x27  radius=100
              fill: #FFFFFF
              effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
              effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
              effect: DROP_SHADOW r0 #000000 @ 4%
        - FRAME "Rules Container"  326x56  layout=VERTICAL
          - INSTANCE "Rules"  326x56  layout=VERTICAL  gap=10  pad=0/0/4/0  instance of `55:137` "Rules=Official" of set "Rules"
            - FRAME "Rules"  326x30  layout=HORIZONTAL  gap=16
              - FRAME "Official"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
                fill: #FF6C02
                ...instance internals truncated
              - FRAME "House"  155x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
                ...instance internals truncated
            - TEXT "Save is secret – only victim is notified"  326x12  opacity=50%
              text: "Game continues – Joker can haunt a voter"
              font: Helvetica Neue / HelveticaNeue 10px w400 lh auto
              fill: #FFFFFF
      - FRAME "Hunter"  326x47  layout=HORIZONTAL  gap=10  pad=8/0/8/0
        stroke: #FFFFFF 1px
        - TEXT "Hunter"  45x14
          text: "Hunter"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - INSTANCE "Toggle"  51x31  radius=100  instance of `69:264` "State=Off" of set "Toggle"
          fill: #787880 @ 16%
          - FRAME "Knob"  27x27  radius=100
            fill: #FFFFFF
            effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
            effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
            effect: DROP_SHADOW r0 #000000 @ 4%
      - FRAME "Lovers"  326x47  layout=HORIZONTAL  gap=10  pad=8/0/8/0
        stroke: #FFFFFF 1px
        - TEXT "Lovers"  43x14
          text: "Lovers"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - INSTANCE "Toggle"  51x31  radius=100  instance of `69:264` "State=Off" of set "Toggle"
          fill: #787880 @ 16%
          - FRAME "Knob"  27x27  radius=100
            fill: #FFFFFF
            effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
            effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
            effect: DROP_SHADOW r0 #000000 @ 4%
      - FRAME "Narrator"  326x110  layout=VERTICAL  gap=24  pad=12/0/12/0
        - FRAME "Top"  326x30  layout=HORIZONTAL  gap=16
          - TEXT "Narrator’s voice"  108x14
            text: "Narrator’s voice"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Genders"  129x30  layout=HORIZONTAL  gap=16  instance of `55:60` "Gender=Male" of set "Genders"
            - FRAME "Male"  48x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
              fill: #039BE5
              - TEXT "Male"  32x14
                text: "Male"
                font: Grandstander / Grandstander-Regular 14px w400 lh auto
                fill: #FFFFFF
            - FRAME "Female"  65x30  layout=HORIZONTAL  gap=10  pad=8  radius=8
              - TEXT "Female"  49x14
                text: "Female"
                font: Grandstander / Grandstander-Regular 14px w400 lh auto
                fill: #FFFFFF
        - FRAME "Frame 21"  326x32  layout=HORIZONTAL  gap=10
          - INSTANCE "Arrow left-circle"  32x32  instance of `47:150` "Arrow left-circle"
            - VECTOR "Icon"  26.67x26.67
              stroke: #FFFFFF 3px
          - TEXT "Canadian"  67x14
            text: "Canadian"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Arrow right-circle"  32x32  instance of `47:153` "Arrow right-circle"
            - VECTOR "Icon"  26.67x26.67
              stroke: #FFFFFF 3px
    - FRAME "Roles"  358x94  layout=VERTICAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Mafia members"  105x14
          text: "Mafia members"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "2"  7x14
          text: "2"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - LINE "Line 1"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Frame 9"  326x28  layout=HORIZONTAL  gap=10
        - TEXT "Special Roles"  90x14
          text: "Special Roles"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "Doctor, Detective, Hunter, Joker"  177x28
          text: "Doctor, Detective, Hunter, Joker "
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
    - FRAME "Players"  358x200  layout=VERTICAL  gap=10  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Players"  49x14
          text: "Players"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - TEXT "6/20"  30x14
          text: "6/20"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - LINE "Line 1"  326x0
        stroke: #FFFFFF 1px
      - FRAME "Frame 9"  326x14  layout=HORIZONTAL  gap=10
        - FRAME "Frame 19"  91x14  layout=HORIZONTAL  gap=4
          - TEXT "dale (host)"  73x14
            text: "dale (host)"
            font: Grandstander / Grandstander-Regular 14px w400 lh auto
            fill: #FFFFFF
          - INSTANCE "Star"  14x14  instance of `42:922` "Star"
            - VECTOR "Icon"  11.67x11.1
              stroke: #FFFFFF 1.6px
        - ELLIPSE "Ellipse 16"  14x14
          fill: #E53935
      - FRAME "Frame 10"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "mo"  22x14
          text: "mo"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #AB47BC
      - FRAME "Frame 11"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "jenny"  39x14
          text: "jenny"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #218BE1
      - FRAME "Frame 12"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "kevin"  37x14
          text: "kevin"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #546E7A
      - FRAME "Frame 13"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "natasha"  57x14
          text: "natasha"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #66BB6A
      - FRAME "Frame 14"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "christopher"  77x14
          text: "christopher"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
        - ELLIPSE "Ellipse 16"  14x14
          fill: #FFEE58
    - FRAME "Colors"  358x196  layout=VERTICAL  gap=16  pad=16  radius=16
      fill: #232729
      stroke: #FFFFFF 2px
      effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
      - FRAME "Frame 8"  326x14  layout=HORIZONTAL  gap=10
        - TEXT "Choose your color"  120x14
          text: "Choose your color"
          font: Grandstander / Grandstander-Regular 14px w400 lh auto
          fill: #FFFFFF
      - FRAME "Frame 15"  326x34  layout=HORIZONTAL  gap=24
        - ELLIPSE "Ellipse"  34x34
          fill: #E53935
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #E876A0
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #8E24AA
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #5E35B1
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #3949AB
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #1E88E5
          stroke: #FFFFFF 2px
      - FRAME "Frame 16"  326x34  layout=HORIZONTAL  gap=24
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #039BE5
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #00ACC1
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #00897B
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #43A047
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #7CB342
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #C0CA33
          stroke: #FFFFFF 2px
      - FRAME "Frame 18"  326x34  layout=HORIZONTAL  gap=24
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #FDD835
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #FFB300
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #FB8C00
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #F4511E
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #6D4C41
          stroke: #FFFFFF 2px
        - ELLIPSE "Ellipse"  34x34  opacity=60%
          fill: #757575
          stroke: #FFFFFF 2px
  - FRAME "CTA"  358x60  layout=HORIZONTAL  gap=10  pad=16  radius=16
    fill: #FF6C02
    effect: DROP_SHADOW r23.8 offset 0,4 #000000 @ 20%
    - TEXT "Start game"  79x14
      text: "Start game"
      font: Grandstander / Grandstander-Regular 14px w400 lh auto
      fill: #FFFFFF

## Assets used

_none_

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `55:40` | CTA | ON_CLICK | `74:335` |
| `55:40` | CTA | transitionNodeID | `74:335` |
| `74:268` | Toggle | ON_CLICK | `69:264` |
| `74:268` | Toggle | transitionNodeID | `69:264` |
| `74:287` | Toggle | ON_CLICK | `69:263` |
| `74:287` | Toggle | transitionNodeID | `69:263` |
| `74:291` | Toggle | ON_CLICK | `69:263` |
| `74:291` | Toggle | transitionNodeID | `69:263` |
| `I55:71;55:58` | Female | ON_CLICK | `55:62` |
| `I55:71;55:58` | Female | transitionNodeID | `55:62` |
| `I88:691;74:277` | Toggle | ON_CLICK | `55:214` |
| `I88:691;74:277` | Toggle | transitionNodeID | `55:214` |
| `I88:691;88:704;55:169` | House | ON_CLICK | `55:139` |
| `I88:691;88:704;55:169` | House | transitionNodeID | `55:139` |
| `I88:836;74:277` | Toggle | ON_CLICK | `55:214` |
| `I88:836;74:277` | Toggle | transitionNodeID | `55:214` |
| `I88:836;88:704;55:169` | House | ON_CLICK | `55:139` |
| `I88:836;88:704;55:169` | House | transitionNodeID | `55:139` |
