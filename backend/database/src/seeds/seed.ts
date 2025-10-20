import { query } from '../connection';
import { generateUUID } from '../types';

interface SeedData {
  users: any[];
  farms: any[];
  streams: any[];
  horses: any[];
}

export async function seedDatabase(): Promise<void> {
  console.log('🌱 Starting database seeding...');
  
  const seedData = createSeedData();
  
  try {
    // Clear existing data (development only)
    if (process.env.NODE_ENV === 'development') {
      await clearExistingData();
    }
    
    // Insert users
    await seedUsers(seedData.users);
    
    // Insert farms
    await seedFarms(seedData.farms);
    
    // Insert streams
    await seedStreams(seedData.streams);
    
    // Insert horses
    await seedHorses(seedData.horses);
    
    console.log('✅ Database seeding completed');
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
}

function createSeedData(): SeedData {
  const adminUserId = generateUUID();
  const managerUserId = generateUUID();
  const viewerUserId = generateUUID();
  
  const farmId = generateUUID();
  
  const stream1Id = generateUUID();
  const stream2Id = generateUUID();
  const stream3Id = generateUUID();
  
  return {
    users: [
      {
        id: adminUserId,
        email: 'admin@barnhand.com',
        password_hash: '$2b$10$example.hash.for.development',
        role: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        is_active: true
      },
      {
        id: managerUserId,
        email: 'manager@barnhand.com', 
        password_hash: '$2b$10$example.hash.for.development',
        role: 'manager',
        first_name: 'Farm',
        last_name: 'Manager',
        is_active: true
      },
      {
        id: viewerUserId,
        email: 'viewer@barnhand.com',
        password_hash: '$2b$10$example.hash.for.development', 
        role: 'viewer',
        first_name: 'View',
        last_name: 'User',
        is_active: true
      }
    ],
    
    farms: [
      {
        id: farmId,
        name: 'Oakwood Stables',
        owner_id: managerUserId,
        location: {
          name: 'Kentucky, USA',
          lat: 38.0406,
          lng: -84.5037,
          timezone: 'America/New_York'
        },
        timezone: 'America/New_York',
        metadata: {
          type: 'training_facility',
          horses_capacity: 50,
          established: 1985
        }
      }
    ],
    
    streams: [
      {
        id: stream1Id,
        farm_id: null, // Start unassigned - user can assign via drag-and-drop
        name: 'Paddock Camera 1',
        source_type: 'local',
        source_url: 'http://video-streamer:8003/stream1/index.m3u8',
        status: 'inactive',
        processing_delay: 15,
        chunk_duration: 10,
        config: {
          resolution: '1920x1080',
          fps: 30,
          quality: 'high'
        },
        health_check_url: 'http://video-streamer:8003/health'
      },
      {
        id: stream2Id,
        farm_id: null, // Start unassigned - user can assign via drag-and-drop
        name: 'Training Ring Camera',
        source_type: 'local',
        source_url: 'http://video-streamer:8003/stream2/index.m3u8',
        status: 'inactive',
        processing_delay: 20,
        chunk_duration: 10,
        config: {
          resolution: '1920x1080',
          fps: 30,
          quality: 'high'
        },
        health_check_url: 'http://video-streamer:8003/health'
      },
      {
        id: stream3Id,
        farm_id: null, // Start unassigned - user can assign via drag-and-drop
        name: 'Barn Interior Camera',
        source_type: 'local',
        source_url: 'http://video-streamer:8003/stream3/index.m3u8',
        status: 'inactive',
        processing_delay: 25,
        chunk_duration: 10,
        config: {
          resolution: '1280x720',
          fps: 15,
          quality: 'medium'
        },
        health_check_url: 'http://video-streamer:8003/health'
      },
      {
        id: generateUUID(),
        farm_id: null, // Start unassigned - user can assign via drag-and-drop
        name: 'Pasture Camera 4',
        source_type: 'local',
        source_url: 'http://video-streamer:8003/stream4/index.m3u8',
        status: 'inactive',
        processing_delay: 15,
        chunk_duration: 10,
        config: {
          resolution: '1920x1080',
          fps: 30,
          quality: 'high'
        },
        health_check_url: 'http://video-streamer:8003/health'
      }
    ],
    
    horses: [
      {
        id: generateUUID(),
        farm_id: farmId,
        name: 'Thunder',
        breed: 'Thoroughbred',
        age: 8,
        color: 'Bay',
        markings: 'White blaze, white socks on front legs',
        gender: 'gelding',
        tracking_id: 'HORSE_001',
        ui_color: '#FF4444',
        metadata: {
          trainer: 'Sarah Johnson',
          discipline: 'Dressage',
          temperament: 'Calm'
        }
      },
      {
        id: generateUUID(),
        farm_id: farmId,
        name: 'Luna',
        breed: 'Arabian',
        age: 6,
        color: 'Gray',
        markings: 'Dappled gray coat, black mane and tail',
        gender: 'mare',
        tracking_id: 'HORSE_002', 
        ui_color: '#44FF44',
        metadata: {
          trainer: 'Michael Chen',
          discipline: 'Endurance',
          temperament: 'Spirited'
        }
      },
      {
        id: generateUUID(),
        farm_id: farmId,
        name: 'Copper',
        breed: 'Quarter Horse',
        age: 12,
        color: 'Chestnut',
        markings: 'White star, white front feet',
        gender: 'stallion',
        tracking_id: 'HORSE_003',
        ui_color: '#4444FF',
        metadata: {
          trainer: 'Lisa Rodriguez',
          discipline: 'Western Pleasure', 
          temperament: 'Gentle'
        }
      }
    ]
  };
}

async function clearExistingData(): Promise<void> {
  console.log('🧹 Clearing existing data...');
  
  // Delete in correct order to respect foreign key constraints
  await query('DELETE FROM detections');
  await query('DELETE FROM horse_features');
  await query('DELETE FROM alerts');
  await query('DELETE FROM video_chunks');
  await query('DELETE FROM stream_horses');
  await query('DELETE FROM horses');
  await query('DELETE FROM streams');
  await query('DELETE FROM farms');
  await query('DELETE FROM users');
  
  console.log('✅ Existing data cleared');
}

async function seedUsers(users: any[]): Promise<void> {
  console.log('👥 Seeding users...');
  
  for (const user of users) {
    await query(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.email, user.password_hash, user.role, user.first_name, user.last_name, user.is_active]
    );
  }
  
  console.log(`✅ Seeded ${users.length} users`);
}

async function seedFarms(farms: any[]): Promise<void> {
  console.log('🏠 Seeding farms...');
  
  for (const farm of farms) {
    await query(
      `INSERT INTO farms (id, name, owner_id, location, timezone, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [farm.id, farm.name, farm.owner_id, JSON.stringify(farm.location), farm.timezone, JSON.stringify(farm.metadata)]
    );
  }
  
  console.log(`✅ Seeded ${farms.length} farms`);
}

async function seedStreams(streams: any[]): Promise<void> {
  console.log('📹 Seeding streams...');
  
  for (const stream of streams) {
    await query(
      `INSERT INTO streams (id, farm_id, name, source_type, source_url, status, processing_delay, chunk_duration, config, health_check_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        stream.id, stream.farm_id, stream.name, stream.source_type, stream.source_url,
        stream.status, stream.processing_delay, stream.chunk_duration,
        JSON.stringify(stream.config), stream.health_check_url
      ]
    );
  }
  
  console.log(`✅ Seeded ${streams.length} streams`);
}

async function seedHorses(horses: any[]): Promise<void> {
  console.log('🐴 Seeding horses...');
  
  for (const horse of horses) {
    await query(
      `INSERT INTO horses (id, farm_id, name, breed, age, color, markings, gender, tracking_id, ui_color, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        horse.id, horse.farm_id, horse.name, horse.breed, horse.age,
        horse.color, horse.markings, horse.gender, horse.tracking_id,
        horse.ui_color, JSON.stringify(horse.metadata)
      ]
    );
  }
  
  console.log(`✅ Seeded ${horses.length} horses`);
}

// CLI interface
if (require.main === module) {
  (async () => {
    try {
      await seedDatabase();
      process.exit(0);
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    }
  })();
}