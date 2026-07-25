# Role Toggle

- id: `55:215`
- type: COMPONENT_SET
- page: Components
- size: 366 x 228
- position: x 209, y 81

## Layout

- COMPONENT_SET "Role Toggle"  366x228  radius=5
  stroke: #8A38F5 1px
  - COMPONENT "Toggle=Off"  326x47  layout=VERTICAL  gap=8  pad=8/0/8/0
    stroke: #000000 1px
    - FRAME "Toggle"  326x31  layout=HORIZONTAL  gap=230
      - TEXT "Doctor"  45x14
        text: "Doctor"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
      - INSTANCE "Toggle"  51x31  radius=100  instance of `69:264` "State=Off" of set "Toggle"
        fill: #787880 @ 16%
        - FRAME "Knob"  27x27  radius=100
          fill: #FFFFFF
          effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
          effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
          effect: DROP_SHADOW r0 #000000 @ 4%
  - COMPONENT "Toggle=On"  326x111  layout=VERTICAL  gap=8  pad=8/0/8/0
    stroke: #000000 1px
    - FRAME "Toggle"  326x31  layout=HORIZONTAL  gap=230
      - TEXT "Doctor"  45x14
        text: "Doctor"
        font: Grandstander / Grandstander-Regular 14px w400 lh auto
        fill: #000000
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
          fill: #000000

## Assets used

_none_

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `74:274` | Toggle | ON_CLICK | `55:216` |
| `74:274` | Toggle | ON_CLICK | `69:263` |
| `74:274` | Toggle | transitionNodeID | `69:263` |
| `74:277` | Toggle | ON_CLICK | `55:214` |
| `74:277` | Toggle | transitionNodeID | `55:214` |
| `I88:704;55:169` | House | ON_CLICK | `55:139` |
| `I88:704;55:169` | House | transitionNodeID | `55:139` |
