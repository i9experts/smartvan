/* eslint-disable prettier/prettier */
import { 
  Body, 
  Controller, 
  Post, 
  Req, 
  Get,
  BadRequestException,
  Query,
  Param

  

} from '@nestjs/common';


import { alertService } from './alert.service';
import { AddAlertDto } from './dto/addAlertdto';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';

@Controller('alert')
export class AlertController {
  constructor(private readonly AlertService: alertService) {}


  @UseGuards(AuthGuard('jwt'))
  @Post('addAlert')
  async addAlert(@Body() addAlertDto: AddAlertDto, @Req() req: any) {
    const adminId = req.user.userId
    return this.AlertService.addAlert(addAlertDto, adminId);
  
  }

   @UseGuards(AuthGuard('jwt')) // JWT protection
  @Get('getAlert')
  async getAlert(
    @Req() req: any, // JWT se user info aayega
    @Query('page') page: string,
    @Query('limit') limit: string
  ) {
    // JWT se adminId nikal lo (agar zarurat ho)
    const adminId = req.user.userId;

    if (!adminId) {
      throw new BadRequestException('Admin not found in token');
    }

    // pagination values parse karo
    const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;

    // service function call with pagination
    return this.AlertService.getAlerts(adminId, pageNumber, limitNumber);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getAlertById/:alertId')
  async getAlertById(@Param('alertId') alertId: string, @Req() req: any) {
    const adminId = req.user.userId; // JWT se adminId
    return this.AlertService.getAlertById(adminId, alertId);
  }

@UseGuards(AuthGuard('jwt'))
@Post('editAlert')
async editAlert(@Req() req: any, @Body() body: any) {
  const adminId = req.user.userId; // JWT se admin ID
  const { alertId, ...updateData } = body; // body se alertId alag kar liya

  if (!alertId) {
    throw new BadRequestException('alertId is required');
  }

  return this.AlertService.editAlert(adminId, alertId, updateData);
}
@UseGuards(AuthGuard('jwt'))
@Post('deleteAlert')
async deleteAlert(@Req() req: any, @Body('alertId') alertId: string) {
  const adminId = req.user.userId; 
  return this.AlertService.deleteAlert(adminId, alertId);
}


  // @UseGuards(AuthGuard('jwt'))
  //   @Get('getNotificationByParent')
  // async getKids(@Req() req: any) {
  //   const userId = req.user.userId; // 👈 token se extract hua
  //   return this.AlertService.getAlertsForParent(userId);
  // }

  @UseGuards(AuthGuard('jwt'))
@Get('getNotificationForDriver')
async getAlertsForDriver(@Req() req: any) {
  const  userId  = req.user.userId; 

  console.log(userId)

  return this.AlertService.getAlertsForDriver(userId);
}


 @UseGuards(AuthGuard('jwt'))
  @Get('getDriverNotificationByParent')
  async getDriverNotifications(@Req() req: any) {
    const parentId = req.user.userId; // JWT payload me parentId
    return this.AlertService.getAlertsForParent(parentId);
  }

  @Get('termsOfServices')
async getTermsAndConditions(@Req() req: any) {
  return {
    success: true,
    title: 'Terms of Service',
    html: `
      <p>
        Welcome to Smart Van!
      </p>

      <p>
        These terms and conditions outline the rules and regulations for the use
        of Smart Van's Website, located at Website.com.
      </p>

      <p>
        By accessing this website we assume you accept these terms and conditions.
        Do not continue to use Smart Van if you do not agree to take all of the
        terms and conditions stated on this page.
      </p>

      <p>
        The following terminology applies to these Terms and Conditions, Privacy
        Statement and Disclaimer Notice and all Agreements: "Client", "You" and
        "Your" refers to you, the person log on this website and compliant to the
        Company’s terms and conditions. "The Company", "Ourselves", "We", "Our"
        and "Us", refers to our Company. "Party", "Parties", or "Us", refers to
        both the Client and ourselves.
      </p>

      <p>
        All terms refer to the offer, acceptance and consideration of payment
        necessary to undertake the process of our assistance to the Client in
        the most appropriate manner for the express purpose of meeting the
        Client’s needs in respect of provision of the Company’s stated services,
        in accordance with and subject to, prevailing law of Netherlands.
      </p>

      <p>
        Any use of the above terminology or other words in the singular, plural,
        capitalization and/or he/she or they, are taken as interchangeable and
        therefore as referring to same.
      </p>

      <h3>Cookies</h3>
      <p>
        We employ the use of cookies. By accessing Smart Van, you agreed to use
        cookies in agreement with the Smart Van's Privacy Policy.
      </p>
    `,
  };
}

@Get('privacy-policy')
async getPrivacyPolicy(@Req() req: any) {
  return {
    success: true,
    title: 'Privacy Policy',
    html: `
      <p>
        At Smart Van, accessible at meem.com, one of our main priorities is the
        privacy of our visitors. This Privacy Policy document contains types of
        information that is collected and recorded by Smart Van and how we use it.
      </p>

      <p>
        If you have additional questions or require more information about our
        Privacy Policy, do not hesitate to contact us through email at
        Email@Website.com.
      </p>

      <p>
        This privacy policy applies only to our online activities and is valid
        for visitors to our website with regards to the information that they
        shared and/or collect in Smart Van. This policy is not applicable to any
        information collected offline or via channels other than this website.
      </p>

      <h3>Consent</h3>
      <p>
        By using our website, you hereby consent to our Privacy Policy and agree
        to its terms.
      </p>

      <h3>Information we collect</h3>
      <p>
        The personal information that you are asked to provide, and the reasons
        why you are asked to provide it, will be made clear to you at the point
        we ask you to provide your personal information
        </p>
        `,
  };
}

@Get('aboutSmartVan')
async getAboutSmartVan(@Req() req: any) {
  return {
    success: true,
    title: 'About Smart Van',
    html: `
      <p>
        SmartVan is an intelligent school transportation management system designed
        to bring safety, transparency, and efficiency to daily student commutes.
      </p>

      <p>
        It bridges the gap between parents, schools, and transport providers
        through real-time technology and seamless communication.
      </p>

      <p>
        In today’s fast-paced world, ensuring the safety of children during travel
        has become a top priority for every parent and educational institution.
      </p>

      <p>
        SmartVan addresses this challenge by offering a fully connected and
        automated transportation ecosystem built for modern schools.
      </p>

      <p>
        SmartVan is created with the vision to redefine how school transportation
        is managed and experienced by all stakeholders.
      </p>

      <p>
        It replaces traditional manual processes with smart, digital, and
        data-driven solutions that improve visibility and control.
      </p>

      <p>
        The platform ensures that every student’s journey is monitored, secure,
        organized, and optimized from pickup to drop-off.
      </p>

      <p>
        With SmartVan, parents no longer need to worry about their child’s
        whereabouts during transit because they can track the vehicle in real time.
      </p>

      <p>
        Parents also receive instant updates and notifications related to arrival,
        pickup, drop-off, delays, and emergencies.
      </p>

      <p>
        This level of transparency brings peace of mind to families and builds
        trust between schools and parents.
      </p>

      <p>
        For schools, SmartVan provides complete operational control over their
        transportation system through a centralized admin platform.
      </p>

      <p>
        School administrators can manage routes, assign students, monitor drivers,
        view attendance, and generate useful reports.
      </p>

      <p>
        This eliminates the need for manual coordination and significantly reduces
        administrative effort and communication gaps.
      </p>

      <p>
        Drivers also benefit from a guided and simplified experience through a
        dedicated application tailored to their daily tasks.
      </p>

      <p>
        They can access route details, view student pickup lists, navigate stops,
        and update trip-related activities in real time.
      </p>

      <p>
        This improves efficiency, reduces confusion, and helps ensure timely and
        accurate pickups and drop-offs.
      </p>

      <p>
        SmartVan integrates advanced GPS tracking technology to enable real-time
        monitoring of vehicles on a live map.
      </p>

      <p>
        Schools and parents can easily view the current location of the vehicle
        and stay informed about its movement throughout the trip.
      </p>

      <p>
        The system can also maintain route history, travel logs, and location
        records for monitoring and analysis purposes.
      </p>

      <p>
        SmartVan supports geo-fencing capabilities that allow notifications to be
        triggered when a vehicle enters or exits a defined zone.
      </p>

      <p>
        Parents can be notified when the van is approaching their home or has
        reached the school premises.
      </p>

      <p>
        This minimizes waiting time, improves coordination, and helps children
        board and exit the vehicle safely.
      </p>

      <p>
        A robust notification engine is one of the core strengths of SmartVan.
      </p>

      <p>
        It ensures that parents and schools stay informed at every critical point
        of the transport journey.
      </p>

      <p>
        Notifications may include pickup confirmation, drop-off confirmation,
        late arrival alerts, route changes, and emergency messages.
      </p>

      <p>
        Attendance management is another important feature built into the SmartVan platform.
      </p>

      <p>
        Drivers or authorized staff can mark student attendance digitally during
        pickup and drop-off.
      </p>

      <p>
        This allows schools to maintain an accurate record of which students have
        boarded the vehicle and which have safely reached their destination.
      </p>

      <p>
        The platform also supports secure and efficient fee management for school transportation services.
      </p>

      <p>
        Parents can pay transport fees online, while schools can monitor dues,
        payment history, invoices, and billing records.
      </p>

      <p>
        This reduces paperwork and simplifies the payment experience for both
        institutions and families.
      </p>

      <p>
        SmartVan is designed to be scalable and adaptable for institutions of
        different sizes and transportation models.
      </p>

      <p>
        Whether a school manages a few vehicles or a large transport network,
        SmartVan can support its operational needs effectively.
      </p>

      <p>
        It can also be extended to support multi-school operations where a single
        system is used across multiple campuses or organizations.
      </p>

      <p>
        Security is at the heart of the SmartVan platform and its overall architecture.
      </p>

      <p>
        Sensitive information is protected using modern security standards,
        controlled access, and authenticated user roles.
      </p>

      <p>
        Role-based permissions help ensure that each user only sees and manages
        the information relevant to their responsibilities.
      </p>

      <p>
        SmartVan ensures transparency across all stakeholders involved in the
        school transportation process.
      </p>

      <p>
        Parents, school administrators, transport managers, and drivers all have
        access to the information they need in a structured and reliable manner.
      </p>

      <p>
        This reduces miscommunication, improves accountability, and creates a
        more coordinated transport environment.
      </p>

      <p>
        SmartVan is not just a tracking system; it is a complete transportation
        management solution for modern educational institutions.
      </p>

      <p>
        It combines real-time technology, operational automation, safety-focused
        tools, and a user-friendly experience into one integrated platform.
      </p>

      <p>
        The platform is built using modern technologies to ensure reliability,
        responsiveness, and high performance across devices.
      </p>

      <p>
        It is optimized for both web and mobile usage, making it accessible for
        parents, school staff, and drivers whenever needed.
      </p>

      <p>
        SmartVan aims to reduce operational costs by improving route planning,
        reducing delays, and minimizing manual processes.
      </p>

      <p>
        Optimized transportation workflows help schools save time, fuel, and
        effort while improving service quality.
      </p>

      <p>
        It also enhances the overall user experience by delivering timely
        communication, accurate tracking, and dependable transportation insights.
      </p>

      <p>
        SmartVan supports data-driven decision-making through reports and analytics
        related to routes, attendance, trips, and transport operations.
      </p>

      <p>
        These insights help schools evaluate performance and identify
        opportunities for improvement in daily transportation activities.
      </p>

      <p>
        The interface of SmartVan is designed to be simple, clear, and easy to use.
      </p>

      <p>
        Even users with limited technical knowledge can navigate the system and
        perform their tasks without difficulty.
      </p>

      <p>
        SmartVan continues to evolve with changing user needs, school
        requirements, and technological advancements.
      </p>

      <p>
        New features and enhancements can be introduced over time to further
        improve safety, convenience, and operational control.
      </p>

      <p>
        The goal of SmartVan is to create a smarter, safer, and more connected
        school transportation experience for everyone involved.
      </p>

      <p>
        It leverages digital innovation to solve real-world transportation
        challenges faced by schools and families every day.
      </p>

      <p>
        SmartVan empowers parents with visibility and peace of mind.
      </p>

      <p>
        It empowers schools with management tools, insights, and control.
      </p>

      <p>
        It empowers drivers with guidance, route support, and task clarity.
      </p>

      <p>
        Together, these capabilities create a connected ecosystem where safety,
        efficiency, and trust work hand in hand.
      </p>

      <p>
        SmartVan is more than just a software platform; it is a commitment to
        student safety, service quality, and smarter transportation management.
      </p>

      <p>
        It represents a step forward in building stronger, safer, and more
        efficient education infrastructure through technology.
      </p>

      <p>
        By choosing SmartVan, schools invest in reliability, parents gain
        confidence, and students benefit from safer and more organized travel.
      </p>

      <p>
        SmartVan transforms daily transport into a seamless digital experience
        where every journey is visible, managed, and secure.
      </p>

      <p>
        It is the future of school transportation, built to meet today’s needs
        and ready to grow with tomorrow’s expectations.
      </p>
    `,
  };
}

@UseGuards(AuthGuard('jwt'))
@Post('addSupportLink')
async addSupportLink(@Body() body: any, @Req() req: any) {
  const adminId = req.user.userId;
  return this.AlertService.addSupportLink(body, adminId);
}

@UseGuards(AuthGuard('jwt'))
@Get('getSupportLinks')
async getSupportLinks() {
  return this.AlertService.getSupportLinks();
}
@UseGuards(AuthGuard('jwt'))
@Post('deleteSupportLink')
async deleteSupportLink(@Body('id') id: string) {
  return this.AlertService.deleteSupportLink(id);
}

// Driver -> school admin communication. Separate from addAlert (which is
// admin broadcasting outward) and separate from the Reports/Complaints
// system (formal issue tracking with status) — this is a quick message
// or voice note a driver can send directly to their school's admin.
@UseGuards(AuthGuard('jwt'))
@Post('sendAlertByDriver')
async sendAlertByDriver(@Req() req: any, @Body() body: { message?: string; audioUrl?: string }) {
  const driverId = req.user.userId;
  return this.AlertService.sendAlertByDriver(driverId, body.message, body.audioUrl);
}

@UseGuards(AuthGuard('jwt'))
@Get('getDriverAlertsForAdmin')
async getDriverAlertsForAdmin(
  @Req() req: any,
  @Query('page') page: string,
  @Query('limit') limit: string,
) {
  const adminId = req.user.userId;
  const pageNumber = page ? parseInt(page) : 1;
  const limitNumber = limit ? parseInt(limit) : 10;
  return this.AlertService.getDriverAlertsForAdmin(adminId, pageNumber, limitNumber);
}

}

