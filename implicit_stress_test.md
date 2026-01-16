[CHARACTER|Harald] (INITIATES) [EVENT|Harald Attempts Reform]
[EVENT|Harald Dies at Aurust] (OCCURS_IN) [LOCATION|Aurust Castle]
[CHARACTER|Shanks] (DEFEATS) [CHARACTER|Loki]
[CHARACTER|Shanks] (CONNECTED_TO) [EVENT|Shanks Defeats Loki (Past)]
[FACTION|Knights of God] (PURSUES) [EVENT|Knights Aim to Annex Elbaph]
[EVENT|Knights Aim to Annex Elbaph] (TARGETS) [LOCATION|Elbaph]

[EVENT|Race for One Piece Intensifies|{"type":"Global competition"}]
[FACTION|Red Hair Pirates] (PARTICIPATES_IN) [EVENT|Race for One Piece Intensifies]
[FACTION|Blackbeard Pirates] (PARTICIPATES_IN) [EVENT|Race for One Piece Intensifies]
[FACTION|Cross Guild] (PARTICIPATES_IN) [EVENT|Race for One Piece Intensifies]
[FACTION|Straw Hat Pirates] (PARTICIPATES_IN) [EVENT|Race for One Piece Intensifies]

[CHARACTER|Roronoa Zoro] (RIVALS_WITH) [CHARACTER|Sanji]
[CHARACTER|Nami] (DISCIPLINES) [CHARACTER|Monkey D. Luffy]
[CHARACTER|Usopp] (ADMires) [FACTION|Giant Warrior Pirates]
[CHARACTER|Franky] (ADMires) [LOCATION|Treasure Tree Adam]
[CHARACTER|Brook] (SUPPORTS) [CHARACTER|Nico Robin]
[CHARACTER|Jinbe] (ADVISES) [CHARACTER|Monkey D. Luffy]
[CHARACTER|Tony Tony Chopper] (CARES_FOR) [FACTION|Straw Hat Pirates]

It was a dark day when Harald fell at Aurust. The Knights wasted no time pushing towards Elbaph. But Shanks was waiting. He had already dealt with Loki and wasn't about to let the Knights of God take the land of giants.

Across the sea, the race was on. The Red Hair Pirates and Blackbeard Pirates were neck and neck, with the Cross Guild looming in the shadows. But the Straw Hats were the ones to watch.

On the deck, Zoro polished his blades while Sanji kicked him. Nami yelled at them both. "Luffy! Stop eating the supplies!" she screamed. Monkey D. Luffy just laughed, stuffing his face. Usopp was trembling, telling Chopper about the time he fought the Giant Warrior Pirates single-handedly. Franky was inspecting the hull, made of Treasure Tree Adam. Brook asked Robin for a duet. Jinbe steered the ship, the only sane member of the Straw Hat Pirates.

Edge Case Testing:

Overlaps:
- [CHARACTER|Luffy] vs Luffy -> Explicit tag should win (no double highlight).
- Monkey D. Luffy vs Luffy -> "Monkey D. Luffy" should match as one token (Longest Match).

Case Insensitivity (if enabled):
- luffy vs Luffy
- shanks vs Shanks

Partial Matches:
- "The Aurust Castle defense" -> "Aurust Castle" matched.
- "He went to Aurust" -> "Aurust" matched (Alias).
