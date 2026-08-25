SURFACE_IDS = {
    "out_of_bounds": 0,
    "rough": 1,
    "fairway": 2,
    "green": 3,
    "tee": 4,
    "bunker": 5,
    "water": 6,
}

SURFACE_PHYSICS = {
    "out_of_bounds": {
        "rollingResistance": 0.72,
        "restitution": 0.12,
        "spinRetention": 0.2,
        "clubPenalty": 0.6,
    },
    "rough": {
        "rollingResistance": 0.41,
        "restitution": 0.21,
        "spinRetention": 0.43,
        "clubPenalty": 0.72,
    },
    "fairway": {
        "rollingResistance": 0.14,
        "restitution": 0.46,
        "spinRetention": 0.76,
        "clubPenalty": 1.0,
    },
    "green": {
        "rollingResistance": 0.07,
        "restitution": 0.32,
        "spinRetention": 0.91,
        "clubPenalty": 1.0,
    },
    "tee": {
        "rollingResistance": 0.12,
        "restitution": 0.44,
        "spinRetention": 0.82,
        "clubPenalty": 1.0,
    },
    "bunker": {
        "rollingResistance": 0.62,
        "restitution": 0.08,
        "spinRetention": 0.22,
        "clubPenalty": 0.48,
    },
    "water": {
        "rollingResistance": 1.0,
        "restitution": 0.0,
        "spinRetention": 0.0,
        "clubPenalty": 0.0,
    },
}
