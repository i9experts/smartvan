/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/databaseservice';
import { academicLevelForGrade } from 'src/common/academic-level';
import { reverseGeocodeAreas } from 'src/common/reverse-geocode';

// Age buckets chosen to roughly track school stages (toddler/pre-primary,
// primary, middle, secondary, post-16) rather than even 5-year spans — more
// useful for a school-transport audience than generic demographic buckets.
const AGE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: 'Under 5', min: 0, max: 4 },
  { label: '5-8', min: 5, max: 8 },
  { label: '9-12', min: 9, max: 12 },
  { label: '13-16', min: 13, max: 16 },
  { label: '17+', min: 17, max: 200 },
];

@Injectable()
export class ParentIntelligenceService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getOverview() {
    const { KidModel, parentModel } = this.databaseService.repositories;

    const [totalParents, linkedParents, parentsWithKids, unlinkedParentSchoolDemand] = await Promise.all([
      parentModel.countDocuments({ userType: 'parent', isDelete: { $ne: true } }),
      parentModel.countDocuments({ userType: 'parent', isDelete: { $ne: true }, schoolId: { $nin: [null, ''] } }),
      KidModel.distinct('parentId'),
      // Parents who registered (typing their school's name at signup — see
      // RegisterDto.schoolName) but never got as far as a linked School, nor
      // added a kid — today this is most of the "unmet demand" signal, since
      // Add Kid still requires picking an already-onboarded school.
      parentModel.aggregate([
        {
          $match: {
            userType: 'parent',
            isDelete: { $ne: true },
            schoolId: { $in: [null, ''] },
            schoolName: { $nin: [null, ''] },
          },
        },
        { $group: { _id: { $toLower: '$schoolName' }, label: { $first: '$schoolName' }, count: { $sum: 1 } } },
      ]),
    ]);

    const pipeline: any[] = [
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalKids: { $sum: 1 },
                attachedKids: { $sum: { $cond: ['$isProspect', 0, 1] } },
                prospectKids: { $sum: { $cond: ['$isProspect', 1, 0] } },
              },
            },
          ],
          byLevel: [
            { $match: { academicLevel: { $in: ['primary', 'secondary'] } } },
            { $group: { _id: '$academicLevel', count: { $sum: 1 } } },
          ],
          byGrade: [
            { $match: { grade: { $nin: [null, ''] } } },
            { $group: { _id: '$grade', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          byAgeBucket: [
            { $match: { age: { $ne: null } } },
            {
              $bucket: {
                groupBy: '$age',
                boundaries: [0, 5, 9, 13, 17, 200],
                default: 'unknown',
                output: { count: { $sum: 1 } },
              },
            },
          ],
          byCountry: this.topValuesPipeline('country', 10),
          byCity: this.topValuesPipeline('city', 10),
          byDistrict: this.topValuesPipeline('district', 10),
          byTown: this.topValuesPipeline('town', 10),
          topProspectSchools: [
            { $match: { isProspect: true, prospectSchoolName: { $nin: [null, ''] } } },
            {
              $group: {
                _id: { $toLower: '$prospectSchoolName' },
                label: { $first: '$prospectSchoolName' },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 15 },
            { $project: { _id: 0, schoolName: '$label', count: 1 } },
          ],
          topActiveSchools: [
            { $match: { isProspect: false, schoolId: { $nin: [null, ''] } } },
            { $group: { _id: '$schoolId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
            {
              $lookup: {
                from: 'schools',
                let: { schoolObjId: { $toObjectId: '$_id' } },
                pipeline: [
                  { $match: { $expr: { $eq: ['$_id', '$$schoolObjId'] } } },
                  { $project: { schoolName: 1 } },
                ],
                as: 'school',
              },
            },
            {
              $project: {
                _id: 0,
                schoolId: '$_id',
                schoolName: { $ifNull: [{ $arrayElemAt: ['$school.schoolName', 0] }, 'Unknown school'] },
                count: 1,
              },
            },
          ],
          registrationsOverTime: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, month: '$_id', count: 1 } },
          ],
        },
      },
    ];

    const [facetResult] = await KidModel.aggregate(pipeline);

    const totals = facetResult.totals[0] || { totalKids: 0, attachedKids: 0, prospectKids: 0 };

    // Merge the two "unmet demand" signals — a parent's self-typed
    // schoolName at registration, and a prospectSchoolName typed on a kid
    // (once the app ships that flow) — by normalized name, so the same real
    // school doesn't show up twice just because it was named in two places.
    const demandByName = new Map<string, { schoolName: string; count: number }>();
    for (const row of facetResult.topProspectSchools as Array<{ schoolName: string; count: number }>) {
      const key = row.schoolName.trim().toLowerCase();
      demandByName.set(key, { schoolName: row.schoolName, count: (demandByName.get(key)?.count || 0) + row.count });
    }
    for (const row of unlinkedParentSchoolDemand as Array<{ _id: string; label: string; count: number }>) {
      const key = row._id;
      demandByName.set(key, { schoolName: row.label, count: (demandByName.get(key)?.count || 0) + row.count });
    }
    const topUnmetDemandSchools = [...demandByName.values()].sort((a, b) => b.count - a.count).slice(0, 15);

    return {
      totalParents,
      linkedParents,
      unlinkedParents: Math.max(totalParents - linkedParents, 0),
      parentsWithKids: parentsWithKids.length,
      parentsWithNoKids: Math.max(totalParents - parentsWithKids.length, 0),
      totalKids: totals.totalKids,
      attachedKids: totals.attachedKids,
      prospectKids: totals.prospectKids,
      byLevel: facetResult.byLevel,
      byGrade: facetResult.byGrade,
      byAgeBucket: facetResult.byAgeBucket.map((b: any) => ({
        label: AGE_BUCKETS.find((a) => a.min === b._id)?.label || String(b._id),
        count: b.count,
      })),
      byCountry: facetResult.byCountry,
      byCity: facetResult.byCity,
      byDistrict: facetResult.byDistrict,
      byTown: facetResult.byTown,
      topUnmetDemandSchools,
      topActiveSchools: facetResult.topActiveSchools,
      registrationsOverTime: facetResult.registrationsOverTime,
    };
  }

  private topValuesPipeline(field: string, limit: number) {
    return [
      { $match: { [field]: { $nin: [null, ''] } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 0, value: '$_id', count: 1 } },
    ];
  }

  async getRegister(params: {
    page?: number;
    limit?: number;
    search?: string;
    city?: string;
    country?: string;
    district?: string;
    town?: string;
    schoolId?: string;
    level?: string;
    grade?: string;
    ageMin?: number;
    ageMax?: number;
    status?: 'attached' | 'prospect';
  }) {
    const { KidModel } = this.databaseService.repositories;
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 25, 1), 100);

    const match: any = {};
    if (params.city) match.city = params.city;
    if (params.country) match.country = params.country;
    if (params.district) match.district = params.district;
    if (params.town) match.town = params.town;
    if (params.level) match.academicLevel = params.level;
    if (params.grade) match.grade = params.grade;
    if (params.status === 'attached') match.isProspect = { $ne: true };
    if (params.status === 'prospect') match.isProspect = true;
    if (params.schoolId) match.schoolId = params.schoolId;
    if (params.ageMin != null || params.ageMax != null) {
      match.age = {};
      if (params.ageMin != null) match.age.$gte = params.ageMin;
      if (params.ageMax != null) match.age.$lte = params.ageMax;
    }

    // A parent who registered (schoolName typed at signup) but never got as
    // far as adding a kid has no Kid document at all, so they were
    // previously invisible here no matter how they registered — only
    // showing up in the overview's topUnmetDemandSchools, never in the
    // actual register. Union them in, unless a kid-only filter (grade, age,
    // location, a specific school...) is active, since a kidless parent has
    // none of those fields to match against, or the filter is "attached"
    // (a kidless parent is definitionally not attached to anything).
    const kidOnlyFilterActive = !!(
      params.city || params.country || params.district || params.town ||
      params.level || params.grade || params.schoolId ||
      params.ageMin != null || params.ageMax != null
    );
    const includeKidlessParents = params.status !== 'attached' && !kidOnlyFilterActive;

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'parents',
          localField: 'parentId',
          foreignField: '_id',
          as: 'parent',
        },
      },
      { $unwind: { path: '$parent', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'schools',
          let: { schoolObjId: { $cond: [{ $ne: ['$schoolId', null] }, { $toObjectId: '$schoolId' }, null] } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$schoolObjId'] } } },
            { $project: { schoolName: 1 } },
          ],
          as: 'school',
        },
      },
    ];

    if (params.search?.trim()) {
      const re = new RegExp(params.search.trim(), 'i');
      pipeline.push({
        $match: {
          $or: [
            { fullname: re },
            { 'parent.fullname': re },
            { 'parent.email': re },
            { 'parent.phoneNo': re },
            { prospectSchoolName: re },
          ],
        },
      });
    }

    pipeline.push({
      $project: {
        kidName: '$fullname',
        grade: 1,
        age: 1,
        gender: 1,
        academicLevel: 1,
        city: 1,
        district: 1,
        town: 1,
        country: 1,
        isProspect: 1,
        prospectSchoolName: 1,
        createdAt: 1,
        schoolName: { $ifNull: [{ $arrayElemAt: ['$school.schoolName', 0] }, '$prospectSchoolName'] },
        parentName: '$parent.fullname',
        parentEmail: '$parent.email',
        parentPhone: '$parent.phoneNo',
      },
    });

    if (includeKidlessParents) {
      const parentMatch: any = [
        { $match: { userType: 'parent', isDelete: { $ne: true } } },
        { $lookup: { from: 'kids', localField: '_id', foreignField: 'parentId', as: 'kids' } },
        { $match: { kids: { $size: 0 } } },
      ];
      if (params.search?.trim()) {
        const re = new RegExp(params.search.trim(), 'i');
        parentMatch.push({
          $match: { $or: [{ fullname: re }, { email: re }, { phoneNo: re }, { schoolName: re }] },
        });
      }
      parentMatch.push({
        $project: {
          kidName: { $literal: null },
          grade: { $literal: null },
          age: { $literal: null },
          gender: { $literal: null },
          academicLevel: { $literal: null },
          city: { $literal: null },
          district: { $literal: null },
          town: { $literal: null },
          country: { $literal: null },
          isProspect: { $literal: true },
          prospectSchoolName: '$schoolName',
          createdAt: 1,
          schoolName: { $ifNull: ['$schoolName', null] },
          parentName: '$fullname',
          parentEmail: '$email',
          parentPhone: '$phoneNo',
        },
      });
      pipeline.push({ $unionWith: { coll: 'parents', pipeline: parentMatch } });
    }

    pipeline.push({
      $facet: {
        rows: [{ $sort: { createdAt: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    });

    const [result] = await KidModel.aggregate(pipeline);
    const total = result.total[0]?.count || 0;

    return {
      rows: result.rows,
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  // One-time (re-runnable) data fix: every kid added before this feature
  // shipped has no academicLevel/city/district/town/country at all, which
  // is why the overview's charts render empty despite real attached kids
  // existing. academicLevel is pure computation from grade — cheap, do every
  // such kid in one bulk write. Geocoding needs a real external call per
  // kid, so it's capped and batched per call; call again to pick up the
  // rest (geoRemaining tells the caller whether to).
  async backfillIntelligenceFields() {
    const { KidModel } = this.databaseService.repositories;

    const needsLevel = await KidModel.find(
      { grade: { $nin: [null, ''] }, academicLevel: { $exists: false } },
      { grade: 1 },
    );
    if (needsLevel.length) {
      await KidModel.bulkWrite(
        needsLevel.map((k: any) => ({
          updateOne: {
            filter: { _id: k._id },
            update: { $set: { academicLevel: academicLevelForGrade(k.grade) } },
          },
        })),
      );
    }

    const GEO_BATCH = 60;
    const GEO_CONCURRENCY = 10;
    const needsGeo = await KidModel.find(
      { homeLat: { $ne: null }, homeLng: { $ne: null }, city: { $exists: false } },
      { homeLat: 1, homeLng: 1 },
    ).limit(GEO_BATCH);

    let geoUpdated = 0;
    for (let i = 0; i < needsGeo.length; i += GEO_CONCURRENCY) {
      const slice = needsGeo.slice(i, i + GEO_CONCURRENCY);
      const results = await Promise.all(
        slice.map(async (kid: any) => {
          const geo = await reverseGeocodeAreas(kid.homeLat, kid.homeLng);
          if (!geo) return false;
          await KidModel.updateOne(
            { _id: kid._id },
            { $set: { city: geo.city, district: geo.district, town: geo.town, country: geo.country } },
          );
          return true;
        }),
      );
      geoUpdated += results.filter(Boolean).length;
    }

    const geoRemaining = await KidModel.countDocuments({
      homeLat: { $ne: null },
      homeLng: { $ne: null },
      city: { $exists: false },
    });

    return {
      academicLevelUpdated: needsLevel.length,
      geoUpdated,
      geoRemaining,
    };
  }
}
