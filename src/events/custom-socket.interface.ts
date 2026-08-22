import { Socket } from 'socket.io';

export interface CustomSocket extends Socket {
  decoded_token: {
    sub?: string;
    userId?: string;
    userType?: string;
    role?: string; // admin/superadmin tokens use this instead of userType
    // Add any other properties your JWT might contain
  };
}
