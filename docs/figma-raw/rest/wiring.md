# Figma wiring

## Connectors

| connector id | trigger name | source | target |
| --- | --- | --- | --- |
| `130:440` | tap | `42:810` Settings | `130:370` Lobby / Settings |
| `135:1024` | tap | `135:975` CTA | `130:529` Save a player |
| `135:1029` | tap | `135:678` Check | `135:763` Confirmed kill |
| `135:1034` | tap | `135:887` Check | `135:894` Save Confirmed |
| `135:1039` | tap | `135:889` X | `135:961` Doctor |
| `135:628` | tap | `135:474` CTA | `135:489` Various states |
| `135:633` | tap | `135:503` CTA | `130:323` Mafia / Nominate |
| `140:1247` | tap | `135:975` CTA | `130:529` Save a player |
| `140:1251` | tap | `135:1048` CTA | `140:1186` Investigate |
| `140:1256` | tap | `140:1242` X | `130:625` Detective |
| `140:1310` | tap | `140:1240` Check | `140:1261` Investigation Confirmed |
| `225:422` | tap | `225:417` CTA | `225:364` Kill |
| `225:536` | tap | `225:419` CTA | `225:490` Spared |
| `234:1512` | tap | `225:557` CTA | `234:1332` Shoot |
| `234:1517` | tap | `225:559` CTA | `234:1397` Hold fire |
| `245:476` | tap | `245:417` CTA | `245:422` Spectating mafia |
| `254:860` | tap | `254:858` CTA | `245:422` Spectating mafia |
| `257:1590` | tap | `257:1514` CTA | `257:1530` Joker |
| `257:1716` | tap | `234:1381` CTA | `257:1670` CTA |
| `257:1786` | tap | `225:379` CTA | `257:1726` Kill |
| `257:1811` | tap | `257:1744` Check | `225:427` Kill confirmed |
| `257:1816` | tap | `257:1673` Check | `234:1444` Confirmed kill |
| `257:1838` | tap | `257:1548` Check | `257:1595` Joker |
| `257:830` | tap | `254:875` CTA | `245:422` Spectating mafia |
| `262:2385` | tap | `262:2379` CTA | `225:490` Spared |
| `262:2396` | tap | `262:2390` CTA | `234:1397` Hold fire |
| `268:791` | tap | `268:566` icon | `268:640` Lobby / Roles in Play |
| `270:1185` | after delay | `268:955` Doctor saved a life | `270:1067` Narrator prompt |
| `270:1342` | after delay | `270:1237` Death notification | `270:1294` Narrator prompt |
| `271:1912` | tap | `270:1634` CTA | `270:1649` Voting |
| `271:1917` | tap | `271:1862` CTA | `270:1471` Main screen |
| `271:1922` | tap | `270:1736` CTA | `270:1741` Execute |
| `271:1927` | tap | `270:1738` CTA | `270:1801` Spare |
| `271:2223` | tap | `270:1646` CTA | `271:1932` End Day |
| `271:2233` | tap | `271:2220` CTA | `270:1471` Main screen |
| `278:2676` | tap | `278:2458` CTA | `278:2596` Force Dawn confirm |
| `278:2681` | tap | `278:2673` CTA | `278:2401` Force Dawn button |
| `287:3254` | tap | `287:3248` CTA | `45:466` Lobby / Host |
| `43:112` | tap | `42:686` CTA | `42:766` Returning User |
| `43:117` | tap | `287:3246` CTA | `42:782` Lobby / Player |

## Prototype interactions

| node id | node name | target | trigger | duration | easing |
| --- | --- | --- | --- | --- | --- |
| `135:1048` | CTA | `140:1186` Investigate | transitionNodeID | 200 | EASE_OUT |
| `135:1048` | CTA | `140:1186` Investigate | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:1121` | X | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `135:1121` | X | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:1128` | Toggle | `69:263` State=On | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:1128` | Toggle | `69:264` State=Off | transitionNodeID | 300 | EASE_OUT |
| `135:1128` | Toggle | `69:264` State=Off | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `135:1133` | Toggle | `69:263` State=On | transitionNodeID | 200 | EASE_OUT |
| `135:1133` | Toggle | `69:263` State=On | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:474` | CTA | `135:489` Various states | transitionNodeID | 200 | EASE_OUT |
| `135:474` | CTA | `135:489` Various states | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:563` | X | `130:323` Mafia / Nominate | transitionNodeID | 200 | EASE_OUT |
| `135:563` | X | `130:323` Mafia / Nominate | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:678` | Check | `135:763` Confirmed kill | transitionNodeID | 200 | EASE_OUT |
| `135:678` | Check | `135:763` Confirmed kill | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:887` | Check | `135:894` Save Confirmed | transitionNodeID | 200 | EASE_OUT |
| `135:887` | Check | `135:894` Save Confirmed | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:889` | X | `135:961` Doctor | transitionNodeID | 200 | EASE_OUT |
| `135:889` | X | `135:961` Doctor | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `135:975` | CTA | `130:529` Save a player | transitionNodeID | 200 | EASE_OUT |
| `135:975` | CTA | `130:529` Save a player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `140:1240` | Check | `140:1261` Investigation Confirmed | transitionNodeID | 200 | EASE_OUT |
| `140:1240` | Check | `140:1261` Investigation Confirmed | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `140:1242` | X | `130:625` Detective | transitionNodeID | 200 | EASE_OUT |
| `140:1242` | X | `130:625` Detective | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `146:1502` | Toggle | `69:264` State=Off | transitionNodeID | 200 | EASE_OUT |
| `146:1502` | Toggle | `69:264` State=Off | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `185:1585` | X | `42:782` Lobby / Player | transitionNodeID | 300 | EASE_OUT |
| `185:1585` | X | `42:782` Lobby / Player | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `185:1589` | Toggle | `69:263` State=On | transitionNodeID | 200 | EASE_OUT |
| `185:1589` | Toggle | `69:263` State=On | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `185:1592` | Toggle | `69:264` State=Off | transitionNodeID | 200 | EASE_OUT |
| `185:1592` | Toggle | `69:264` State=Off | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `185:1595` | Toggle | `69:263` State=On | transitionNodeID | 200 | EASE_OUT |
| `185:1595` | Toggle | `69:263` State=On | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 300 | EASE_OUT |
| `185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `185:1615` | Official | `185:1612` Toggle=Left | transitionNodeID | 300 | EASE_OUT |
| `185:1615` | Official | `185:1612` Toggle=Left | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `225:379` | CTA | `257:1726` Kill | transitionNodeID | 200 | EASE_OUT |
| `225:379` | CTA | `257:1726` Kill | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `225:417` | CTA | `225:364` Kill | transitionNodeID | 200 | EASE_OUT |
| `225:417` | CTA | `225:364` Kill | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `225:419` | CTA | `225:490` Spared | transitionNodeID | 200 | EASE_OUT |
| `225:419` | CTA | `225:490` Spared | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `225:557` | CTA | `234:1332` Shoot | transitionNodeID | 200 | EASE_OUT |
| `225:557` | CTA | `234:1332` Shoot | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `225:559` | CTA | `234:1397` Hold fire | transitionNodeID | 200 | EASE_OUT |
| `225:559` | CTA | `234:1397` Hold fire | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `234:1381` | CTA | `257:1655` Shoot | transitionNodeID | 200 | EASE_OUT |
| `234:1381` | CTA | `257:1655` Shoot | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `245:417` | CTA | `245:422` Spectating mafia | transitionNodeID | 200 | EASE_OUT |
| `245:417` | CTA | `245:422` Spectating mafia | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `254:858` | CTA | `245:422` Spectating mafia | transitionNodeID | 200 | EASE_OUT |
| `254:858` | CTA | `245:422` Spectating mafia | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `254:875` | CTA | `245:422` Spectating mafia | transitionNodeID | 200 | EASE_OUT |
| `254:875` | CTA | `245:422` Spectating mafia | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `257:1514` | CTA | `257:1530` Joker | transitionNodeID | 200 | EASE_OUT |
| `257:1514` | CTA | `257:1530` Joker | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `257:1548` | Check | `257:1595` Joker | transitionNodeID | 200 | EASE_OUT |
| `257:1548` | Check | `257:1595` Joker | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `257:1550` | X | `257:875` Joker | transitionNodeID | 200 | EASE_OUT |
| `257:1550` | X | `257:875` Joker | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `257:1673` | Check | `234:1444` Confirmed kill | transitionNodeID | 200 | EASE_OUT |
| `257:1673` | Check | `234:1444` Confirmed kill | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `257:1675` | X | `234:1332` Shoot | transitionNodeID | 200 | EASE_OUT |
| `257:1675` | X | `234:1332` Shoot | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `257:1744` | Check | `225:427` Kill confirmed | transitionNodeID | 200 | EASE_OUT |
| `257:1744` | Check | `225:427` Kill confirmed | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `262:2379` | CTA | `225:490` Spared | transitionNodeID | 200 | EASE_OUT |
| `262:2379` | CTA | `225:490` Spared | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `262:2382` | CTA | `225:490` Spared | transitionNodeID | 200 | EASE_OUT |
| `262:2382` | CTA | `225:490` Spared | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `262:2390` | CTA | `234:1397` Hold fire | transitionNodeID | 200 | EASE_OUT |
| `262:2390` | CTA | `234:1397` Hold fire | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `262:2393` | CTA | `234:1397` Hold fire | transitionNodeID | 200 | EASE_OUT |
| `262:2393` | CTA | `234:1397` Hold fire | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `268:566` | icon | `268:640` Lobby / Roles in Play | transitionNodeID | 200 | EASE_OUT |
| `268:566` | icon | `268:640` Lobby / Roles in Play | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `268:637` | Settings | `130:370` Lobby / Settings | transitionNodeID | 300 | EASE_OUT |
| `268:637` | Settings | `130:370` Lobby / Settings | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `268:651` | Settings | `268:640` Lobby / Roles in Play | transitionNodeID | 300 | EASE_OUT |
| `268:651` | Settings | `268:640` Lobby / Roles in Play | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `268:714` | X | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `268:714` | X | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `270:1634` | CTA | `270:1649` Voting | transitionNodeID | 200 | EASE_OUT |
| `270:1634` | CTA | `270:1649` Voting | ON_CLICK |  |  |
| `270:1646` | CTA | `271:1932` End Day | transitionNodeID | 200 | EASE_OUT |
| `270:1646` | CTA | `271:1932` End Day | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `270:1736` | CTA | `270:1741` Execute | transitionNodeID | 200 | EASE_OUT |
| `270:1736` | CTA | `270:1741` Execute | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `270:1738` | CTA | `270:1801` Spare | transitionNodeID | 200 | EASE_OUT |
| `270:1738` | CTA | `270:1801` Spare | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `271:1862` | CTA | `270:1471` Main screen | transitionNodeID | 200 | EASE_OUT |
| `271:1862` | CTA | `270:1471` Main screen | ON_CLICK |  |  |
| `271:2220` | CTA | `270:1471` Main screen | transitionNodeID | 200 | EASE_OUT |
| `271:2220` | CTA | `270:1471` Main screen | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `278:2458` | CTA | `278:2596` Force Dawn confirm | transitionNodeID | 200 | EASE_OUT |
| `278:2458` | CTA | `278:2596` Force Dawn confirm | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `278:2673` | CTA | `278:2401` Force Dawn button | transitionNodeID | 200 | EASE_OUT |
| `278:2673` | CTA | `278:2401` Force Dawn button | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `278:2772` | Victory screen | `278:2780` Game options | transitionNodeID | 300 | EASE_OUT |
| `278:2772` | Victory screen | `278:2780` Game options | AFTER_TIMEOUT | 0.30000001192092896 | EASE_OUT |
| `278:2805` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `278:2805` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `278:2807` | CTA | `278:2810` View game details | transitionNodeID | 200 | EASE_OUT |
| `278:2807` | CTA | `278:2810` View game details | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `278:2923` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `278:2923` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `281:3015` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `281:3015` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `281:3065` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `281:3065` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `287:3251` | Pin | `287:3259` Active room code | transitionNodeID | 200 | EASE_OUT |
| `287:3251` | Pin | `287:3259` Active room code | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `287:3267` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `287:3267` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `287:3269` | CTA | `45:466` Lobby / Host | transitionNodeID | 200 | EASE_OUT |
| `287:3269` | CTA | `45:466` Lobby / Host | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `287:3324` | CTA | `278:2401` Force Dawn button | transitionNodeID | 300 | EASE_OUT |
| `287:3324` | CTA | `278:2401` Force Dawn button | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `325:1585` | tab-hotspot-events | `287:3436` Position=Events | transitionNodeID | 200 | EASE_OUT |
| `325:1585` | tab-hotspot-events | `287:3436` Position=Events | ON_CLICK |  |  |
| `332:5211` | CTA | `270:1471` Main screen | transitionNodeID | 200 | EASE_OUT |
| `332:5211` | CTA | `270:1471` Main screen | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:5939` | Victory screen | `332:5960` Game options | transitionNodeID | 300 | EASE_OUT |
| `332:5939` | Victory screen | `332:5960` Game options | AFTER_TIMEOUT | 0.30000001192092896 | EASE_OUT |
| `332:5953` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `332:5953` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:5974` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `332:5974` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:5976` | CTA | `281:2972` View game details | transitionNodeID | 200 | EASE_OUT |
| `332:5976` | CTA | `281:2972` View game details | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:6071` | Victory screen | `332:6092` Game options | transitionNodeID | 300 | EASE_OUT |
| `332:6071` | Victory screen | `332:6092` Game options | AFTER_TIMEOUT | 0.30000001192092896 | EASE_OUT |
| `332:6079` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `332:6079` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:6106` | CTA | `42:782` Lobby / Player | transitionNodeID | 200 | EASE_OUT |
| `332:6106` | CTA | `42:782` Lobby / Player | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:6108` | CTA | `281:3022` View game details | transitionNodeID | 200 | EASE_OUT |
| `332:6108` | CTA | `281:3022` View game details | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:6304` | CTA | `45:466` Lobby / Host | transitionNodeID | 200 | EASE_OUT |
| `332:6304` | CTA | `45:466` Lobby / Host | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `332:6306` | CTA | `278:2810` View game details | transitionNodeID | 200 | EASE_OUT |
| `332:6306` | CTA | `278:2810` View game details | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `42:686` | CTA | `42:766` Returning User | transitionNodeID | 200 | EASE_OUT |
| `42:686` | CTA | `42:766` Returning User | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `42:770` | Log out | `42:678` Auth | transitionNodeID | 200 | EASE_OUT |
| `42:770` | Log out | `42:678` Auth | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `42:810` | Settings | `130:370` Lobby / Settings | transitionNodeID | 200 | EASE_OUT |
| `42:810` | Settings | `130:370` Lobby / Settings | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `55:162` | Official | `55:137` Rules=Official | transitionNodeID | 300 | EASE_OUT |
| `55:162` | Official | `55:137` Rules=Official | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `55:169` | House | `55:139` Rules=House | transitionNodeID | 300 | EASE_OUT |
| `55:169` | House | `55:139` Rules=House | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `55:40` | CTA | `74:335` Main game screen | transitionNodeID | 200 | EASE_OUT |
| `55:40` | CTA | `74:335` Main game screen | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `55:58` | Female | `55:62` Gender=Female | transitionNodeID | 300 | EASE_OUT |
| `55:58` | Female | `55:62` Gender=Female | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `55:62` | Gender=Female | `55:60` Gender=Male | transitionNodeID | 300 | EASE_OUT |
| `55:62` | Gender=Female | `55:60` Gender=Male | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `69:263` | State=On | `69:264` State=Off | transitionNodeID | 300 | EASE_OUT |
| `69:263` | State=On | `69:264` State=Off | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `69:264` | State=Off | `69:263` State=On | transitionNodeID | 300 | EASE_OUT |
| `69:264` | State=Off | `69:263` State=On | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `74:268` | Toggle | `69:264` State=Off | transitionNodeID | 200 | EASE_OUT |
| `74:268` | Toggle | `69:264` State=Off | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `74:274` | Toggle | `55:216` Toggle=On | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `74:274` | Toggle | `69:263` State=On | transitionNodeID | 300 | EASE_OUT |
| `74:274` | Toggle | `69:263` State=On | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `74:277` | Toggle | `55:214` Toggle=Off | transitionNodeID | 300 | EASE_OUT |
| `74:277` | Toggle | `55:214` Toggle=Off | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `74:287` | Toggle | `69:263` State=On | transitionNodeID | 200 | EASE_OUT |
| `74:287` | Toggle | `69:263` State=On | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `74:291` | Toggle | `69:263` State=On | transitionNodeID | 200 | EASE_OUT |
| `74:291` | Toggle | `69:263` State=On | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3440;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3440;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3440;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3440;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3484;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3484;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3484;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3484;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3511;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3511;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3511;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3511;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3538;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3538;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3538;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3538;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3565;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3565;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3565;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3565;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3592;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3592;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3592;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3592;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3619;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3619;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3619;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3619;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3646;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3646;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3646;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3646;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3673;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3673;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3673;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3673;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3700;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3700;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3700;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3700;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3727;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3727;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3727;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3727;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3754;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3754;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3754;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3754;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3781;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3781;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3781;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3781;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3808;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3808;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3808;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3808;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3835;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3835;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3835;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3835;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3862;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3862;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3862;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3862;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3889;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3889;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3889;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3889;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3943;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3943;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3943;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3943;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3970;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3970;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3970;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3970;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:3997;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:3997;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:3997;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:3997;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4024;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4024;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4024;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4024;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4051;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4051;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4078;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4078;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4078;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4078;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4105;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4105;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4105;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4105;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4132;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4132;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4132;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4132;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4159;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4159;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4159;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4159;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4186;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4186;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4186;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4186;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4213;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4213;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4213;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4213;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4240;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4240;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4240;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4240;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4267;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4267;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4267;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4267;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4294;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4294;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4294;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4294;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4321;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4321;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4321;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4321;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4348;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I287:4348;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I287:4348;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I287:4348;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I287:4447;185:1615` | Official | `185:1612` Toggle=Left | transitionNodeID | 200 | EASE_OUT |
| `I287:4447;185:1615` | Official | `185:1612` Toggle=Left | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:4831;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:4831;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:4831;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:4831;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:4865;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:4865;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:4865;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:4865;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:4899;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:4899;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:4899;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:4899;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:4967;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:4967;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:4967;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:4967;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:5001;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:5001;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:5001;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:5001;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:5035;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:5035;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:5035;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:5035;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:5069;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:5069;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:5069;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:5069;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:5137;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:5137;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:5137;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:5137;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:5171;287:3467;185:1610` | House | `185:1614` Toggle=Right | transitionNodeID | 200 | EASE_OUT |
| `I332:5171;287:3467;185:1610` | House | `185:1614` Toggle=Right | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:5171;325:1579` | tab-hotspot-players | `287:3435` Position=Players | transitionNodeID | 200 | EASE_OUT |
| `I332:5171;325:1579` | tab-hotspot-players | `287:3435` Position=Players | ON_CLICK |  |  |
| `I332:5581;185:1615` | Official | `332:5464` UNATTACHED | transitionNodeID | 200 | EASE_OUT |
| `I332:5581;185:1615` | Official | `332:5464` UNATTACHED | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I332:5622;185:1610` | House | `332:5469` UNATTACHED | transitionNodeID | 200 | EASE_OUT |
| `I332:5622;185:1610` | House | `332:5469` UNATTACHED | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I55:205;55:169` | House | `55:139` Rules=House | transitionNodeID | 300 | EASE_OUT |
| `I55:205;55:169` | House | `55:139` Rules=House | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `I55:71;55:58` | Female | `55:62` Gender=Female | transitionNodeID | 200 | EASE_OUT |
| `I55:71;55:58` | Female | `55:62` Gender=Female | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I88:691;74:277` | Toggle | `55:214` Toggle=Off | transitionNodeID | 200 | EASE_OUT |
| `I88:691;74:277` | Toggle | `55:214` Toggle=Off | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I88:691;88:704;55:169` | House | `55:139` Rules=House | transitionNodeID | 300 | EASE_OUT |
| `I88:691;88:704;55:169` | House | `55:139` Rules=House | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `I88:704;55:169` | House | `55:139` Rules=House | transitionNodeID | 300 | EASE_OUT |
| `I88:704;55:169` | House | `55:139` Rules=House | ON_CLICK | 0.30000001192092896 | EASE_OUT |
| `I88:836;74:277` | Toggle | `55:214` Toggle=Off | transitionNodeID | 200 | EASE_OUT |
| `I88:836;74:277` | Toggle | `55:214` Toggle=Off | ON_CLICK | 0.20000000298023224 | EASE_OUT |
| `I88:836;88:704;55:169` | House | `55:139` Rules=House | transitionNodeID | 300 | EASE_OUT |
| `I88:836;88:704;55:169` | House | `55:139` Rules=House | ON_CLICK | 0.30000001192092896 | EASE_OUT |
