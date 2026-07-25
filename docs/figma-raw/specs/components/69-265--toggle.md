# Toggle

- id: `69:265`
- type: COMPONENT_SET
- page: Components
- size: 91 x 109
- position: x 14, y -334

## Layout

- COMPONENT_SET "Toggle"  91x109  radius=5
  stroke: #8A38F5 1px
  - COMPONENT "State=On"  51x31  radius=100
    fill: #34C759
    - FRAME "Knob"  27x27  radius=100
      fill: #FFFFFF
      effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
      effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
      effect: DROP_SHADOW r0 #000000 @ 4%
  - COMPONENT "State=Off"  51x31  radius=100
    fill: #787880 @ 16%
    - FRAME "Knob"  27x27  radius=100
      fill: #FFFFFF
      effect: DROP_SHADOW r1 offset 0,3 #000000 @ 6%
      effect: DROP_SHADOW r8 offset 0,3 #000000 @ 15%
      effect: DROP_SHADOW r0 #000000 @ 4%

## Assets used

_none_

## Wiring

| node id | node name | trigger | target id |
| --- | --- | --- | --- |
| `69:263` | State=On | ON_CLICK | `69:264` |
| `69:263` | State=On | transitionNodeID | `69:264` |
| `69:264` | State=Off | ON_CLICK | `69:263` |
| `69:264` | State=Off | transitionNodeID | `69:263` |
