/* eslint-disable prettier/prettier */
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as schema from "./schema";

@Injectable()
export class DatabaseService {
  constructor(
    @InjectModel('Parent') private parentModel: Model<schema.UserDocument>,
    @InjectModel('Driver') private driverModel: Model<schema.UserDocument>,
    @InjectModel(schema.Admin.name)
    private AdminModel: Model<schema.AdminDocument>,
     @InjectModel(schema.School.name)
    private SchoolModel: Model<schema.SchoolDocument>,
     @InjectModel(schema.Trip.name)
    private TripModel: Model<schema.TripDocument>,
    @InjectModel(schema.Van.name)
    private VanModel: Model<schema.VanDocument>,
    @InjectModel(schema.Kid.name)
    private KidModel: Model<schema.KidDocument>,
     @InjectModel(schema.Notification.name)
    private notificationModel: Model<schema.NotificationDocument>,

     @InjectModel(schema.Report.name)
    private reportModel: Model<schema.ReportDocument>,

    @InjectModel(schema.Route.name)
    private routeModel: Model<schema.RouteDocument>,

    @InjectModel(schema.PromotionBanner.name)
    private PromotionBannerModel: Model<schema.PromotionBannerDocument>,

     @InjectModel(schema.FAQ.name)
    private FAQModel: Model<schema.FAQDocument>,

    
     @InjectModel(schema.Invoice.name)
    private invoiceModel: Model<schema.FAQDocument>,

      @InjectModel(schema.Support.name) 
    private SupportModel: Model<schema.SupportDocument>,
      @InjectModel(schema.Employee.name)
    private EmployeeModel: Model<schema.EmployeeDocument>,
      @InjectModel(schema.AuditLog.name)
    private AuditLogModel: Model<schema.AuditLogDocument>,
     ) {}
     get repositories() {
    return {
      parentModel: this.parentModel,
      driverModel: this.driverModel,
      AdminModel: this.AdminModel,
      SchoolModel: this.SchoolModel,
      VanModel: this.VanModel,
      KidModel: this.KidModel,
      TripModel: this.TripModel,
      notificationModel: this.notificationModel,
      reportModel: this.reportModel,
      FAQModel: this.FAQModel,
      routeModel: this.routeModel,
      invoiceModel: this.invoiceModel,
      PromotionBannerModel: this.PromotionBannerModel,
      supportModel: this.SupportModel,
      employeeModel: this.EmployeeModel,
      auditLogModel: this.AuditLogModel
        };
  }
}