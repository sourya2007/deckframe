import { z } from 'zod';

export const aiTools = {
  zoomToEvent: {
    description: 'Zooms the camera into a specific event location',
    parameters: z.object({
      eventId: z.string().describe('ID or index of the event'),
      zoomFactor: z.number().describe('Target zoom level (e.g. 2.0)'),
      speed: z.number().describe('Transition speed multiplier')
    })
  },
  applyCinematicTilt: {
    description: 'Tilts the 3D plane for a cinematic view',
    parameters: z.object({
      pitch: z.number().describe('Rotation around X axis in radians'),
      yaw: z.number().describe('Rotation around Y axis in radians'),
      roll: z.number().describe('Rotation around Z axis in radians')
    })
  },
  addSoundEffect: {
    description: 'Adds an extra sound effect layer at a timestamp',
    parameters: z.object({
      trackType: z.string().describe('Type of sound (e.g. "whoosh", "impact")'),
      volume: z.number().describe('Volume from 0 to 1'),
      timestamp: z.number().describe('Time in ms')
    })
  }
};
