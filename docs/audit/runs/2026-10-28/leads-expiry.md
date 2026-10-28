# Expiry investigation disposition

Accepted scenarios: [F-C63-003](findings/F-C63-003.md), accepted keyboard input during pending logout; and [F-C63-004](findings/F-C63-004.md), genuine native expiry with unconfirmed capture. Each has browser evidence and controls. The first isolates the backstop with a controlled browser clock; the second uses a real SDK-issued short session and real clocks. Their distinct root causes are not fully established by route history. Successful captures survive both browsers' genuine-expiry controls. No deployed incident is claimed.
