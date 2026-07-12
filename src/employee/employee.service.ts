/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from 'src/database/databaseservice';
import { PERMISSION_KEYS } from './employee.schema';
import { Types } from 'mongoose';
import { AuditLogService } from 'src/audit-log/audit-log.service';

@Injectable()
export class EmployeeService {
  constructor(
    private databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  getAvailablePermissions() {
    return { message: 'Available permissions', data: PERMISSION_KEYS };
  }

  async createEmployee(adminId: string, body: any, actor?: { email: string; role: string }) {
    const { name, email, password, permissions } = body;
    if (!name || !email || !password) {
      throw new BadRequestException('name, email and password are required');
    }

    const existing = await this.databaseService.repositories.employeeModel.findOne({ email });
    if (existing) throw new BadRequestException('An employee with this email already exists');

    const invalidPerms = (permissions || []).filter((p: string) => !PERMISSION_KEYS.includes(p as any));
    if (invalidPerms.length > 0) {
      throw new BadRequestException(`Invalid permission(s): ${invalidPerms.join(', ')}`);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const employee = await this.databaseService.repositories.employeeModel.create({
      name,
      email,
      password: hashedPassword,
      permissions: permissions || [],
      status: 'active',
      createdBy: new Types.ObjectId(adminId),
    });

    if (actor) {
      this.auditLogService.record('employee_created', adminId, actor.email, actor.role, { employeeId: employee._id.toString(), employeeEmail: employee.email });
    }

    return {
      message: 'Employee created successfully',
      data: { id: employee._id, name: employee.name, email: employee.email, permissions: employee.permissions, status: employee.status },
    };
  }

  async getAllEmployees() {
    const employees = await this.databaseService.repositories.employeeModel.find({}, { password: 0 }).sort({ createdAt: -1 });
    return { message: 'Employees fetched successfully', data: employees };
  }

  async updateEmployee(employeeId: string, body: any, actor?: { userId: string; email: string; role: string }) {
    const employee = await this.databaseService.repositories.employeeModel.findById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found');

    if (body.permissions) {
      const invalidPerms = body.permissions.filter((p: string) => !PERMISSION_KEYS.includes(p as any));
      if (invalidPerms.length > 0) {
        throw new BadRequestException(`Invalid permission(s): ${invalidPerms.join(', ')}`);
      }
      employee.permissions = body.permissions;
    }
    if (body.name) employee.name = body.name;
    if (body.status) employee.status = body.status;

    await employee.save();

    if (actor && body.permissions) {
      this.auditLogService.record('employee_permissions_changed', actor.userId, actor.email, actor.role, { employeeId: employee._id.toString(), newPermissions: employee.permissions });
    }

    return { message: 'Employee updated successfully', data: { id: employee._id, name: employee.name, permissions: employee.permissions, status: employee.status } };
  }

  async deleteEmployee(employeeId: string, actor?: { userId: string; email: string; role: string }) {
    const result = await this.databaseService.repositories.employeeModel.findByIdAndDelete(employeeId);
    if (!result) throw new NotFoundException('Employee not found');

    if (actor) {
      this.auditLogService.record('employee_deleted', actor.userId, actor.email, actor.role, { employeeId, deletedEmployeeEmail: (result as any).email });
    }

    return { message: 'Employee removed successfully' };
  }

  async loginEmployee(email: string, password: string) {
    const employee = await this.databaseService.repositories.employeeModel.findOne({ email });
    if (!employee) throw new UnauthorizedException('Invalid credentials');
    if (employee.status !== 'active') throw new UnauthorizedException('Account is inactive');

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign(
      {
        sub: employee._id,
        email: employee.email,
        role: 'employee',
        permissions: employee.permissions,
      },
      { expiresIn: '30d' },
    );

    return {
      message: 'Login successful',
      data: {
        token,
        user: {
          id: employee._id,
          name: employee.name,
          email: employee.email,
          role: 'employee',
          permissions: employee.permissions,
        },
      },
    };
  }

  // ── Ticket assignment (Report/Complaints module) ──────────────────────
  async assignTicket(reportId: string, employeeId: string, actor?: { userId: string; email: string; role: string }) {
    const employee = await this.databaseService.repositories.employeeModel.findById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found');

    const report = await this.databaseService.repositories.reportModel.findByIdAndUpdate(
      reportId,
      { $set: { assignedTo: employeeId, assignedAt: new Date() } },
      { new: true },
    );
    if (!report) throw new NotFoundException('Ticket not found');

    if (actor) {
      this.auditLogService.record('ticket_assigned', actor.userId, actor.email, actor.role, { reportId, assignedToEmployeeId: employeeId, employeeName: employee.name });
    }

    return { message: 'Ticket assigned successfully', data: report };
  }

  async getMyTickets(employeeId: string) {
    const tickets = await this.databaseService.repositories.reportModel.find({ assignedTo: employeeId }).sort({ createdAt: -1 });
    return { message: 'Assigned tickets fetched successfully', data: tickets };
  }

  // Employee-safe status update — no school scoping, just verifies the ticket is actually assigned to this employee
  async updateMyTicketStatus(employeeId: string, reportId: string, status: string, adminRemarks?: string) {
    const validStatuses = ['pending', 'in_progress', 'resolved', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const report = await this.databaseService.repositories.reportModel.findOne({ _id: reportId, assignedTo: employeeId });
    if (!report) throw new NotFoundException('Ticket not found or not assigned to you');

    report.status = status;
    if (adminRemarks) report.adminRemarks = adminRemarks;
    if ((status === 'resolved' || status === 'rejected') && !report.resolvedAt) {
      report.resolvedAt = new Date();
    }
    await report.save();

    return { message: 'Ticket status updated successfully', data: report };
  }
}
