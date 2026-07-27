import React from 'react';
import { View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import type { IconCmp } from './SpecGrid';

// Vehify's own icon set (src/icons/vehify/, filled currentColor traces).
// Only the icons we actually use are imported here — Metro bundles just these,
// so the other ~185 vendored icons cost nothing. Add a line as new ones are used.
import DocumentReport from '../icons/vehify/document-report.svg';
import CarSide from '../icons/vehify/car-side.svg';
import Door from '../icons/vehify/door.svg';
import Engine from '../icons/vehify/engine.svg';
import GaugeHorsepower from '../icons/vehify/gauge-horsepower.svg';
import Drivetrain4x4 from '../icons/vehify/drivetrain-4x4.svg';
import FuelPump from '../icons/vehify/fuel-pump.svg';
import FuelEconomyBarChart from '../icons/vehify/fuel-economy-bar-chart.svg';
import MapPin from '../icons/vehify/map-pin.svg';
import Factory from '../icons/vehify/factory.svg';
import ShieldCheck from '../icons/vehify/shield-check.svg';
import MessageComplaints from '../icons/vehify/message-bubble-complaints.svg';
import CrashCollision from '../icons/vehify/crash-collision.svg';
import TriangleAlertRecall from '../icons/vehify/triangle-alert-recall.svg';
import ShieldInvestigation from '../icons/vehify/shield-investigation.svg';
// Report sections
import MarketValue from '../icons/vehify/market-value.svg';
import Depreciation from '../icons/vehify/depreciation.svg';
import VehicleHistory from '../icons/vehify/vehicle-history.svg';
import Odometer from '../icons/vehify/odometer.svg';
import GeneralWarning from '../icons/vehify/general-warning.svg';
import OwnershipHistory from '../icons/vehify/ownership-history.svg';
import AuctionHistory from '../icons/vehify/auction-history.svg';
import VehicleTitle from '../icons/vehify/vehicle-title-certificate.svg';
import GoodDeal from '../icons/vehify/good-deal.svg';
import SimilarListings from '../icons/vehify/similar-listings.svg';
import ServiceHistory from '../icons/vehify/service-history.svg';
import RecallCampaign from '../icons/vehify/recall-campaign.svg';
import CrashTest from '../icons/vehify/crash-test.svg';
import Checklist from '../icons/vehify/checklist.svg';
import ChargingStation from '../icons/vehify/charging-station.svg';
import AiSummary from '../icons/vehify/ai-summary.svg';
import LockIcon from '../icons/vehify/lock.svg';
import AccidentDamage from '../icons/vehify/accident-damage.svg';
import TheftStolen from '../icons/vehify/theft-stolen.svg';
import LienIcon from '../icons/vehify/lien.svg';
import CameraScan from '../icons/vehify/camera-scan.svg';
// Extended specifications
import TrimLevel from '../icons/vehify/trim-level.svg';
import TransmissionIcon from '../icons/vehify/transmission.svg';
import Cylinders from '../icons/vehify/cylinders.svg';
import SeatCount from '../icons/vehify/seat-count.svg';
import YearMakeModel from '../icons/vehify/year-make-model.svg';
import WheelbaseIcon from '../icons/vehify/wheelbase.svg';
import TowPackage from '../icons/vehify/tow-package.svg';
import BrakeService from '../icons/vehify/brake-service.svg';
import BatteryService from '../icons/vehify/battery-service.svg';

/**
 * Adapt a vendored SVG to the shared IconCmp signature ({ size, color,
 * strokeWidth }) so Vehify icons drop into the same slots as lucide icons.
 * These are FILLED glyphs — `strokeWidth` is accepted for interface parity but
 * ignored. `color` themes the whole icon (single currentColor path).
 */
function wrap(Svg: React.FC<SvgProps>, scale = 1): IconCmp {
  return function VehifyIcon({ size = 24, color }: { size?: number; color?: string; strokeWidth?: number }) {
    if (scale === 1) return <Svg width={size} height={size} color={color} />;
    // Draw the glyph larger than its layout box and let it overflow (centered)
    // into the surrounding gap/padding — the icon looks bigger WITHOUT growing
    // its footprint, so it never pushes labels or tiles around.
    const s = size * scale;
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={s} height={s} color={color} />
      </View>
    );
  };
}

// Specifications — car-side + crash-collision (+ accident-damage) trace lighter
// than the rest, so bump them 1.4× to sit at the same visual weight.
export const VBodyStyle = wrap(CarSide, 1.4);
export const VDoors = wrap(Door);
export const VEngine = wrap(Engine);
export const VHorsepower = wrap(GaugeHorsepower);
export const VDriveType = wrap(Drivetrain4x4);
export const VFuelType = wrap(FuelPump);
export const VFuelEconomy = wrap(FuelEconomyBarChart);
export const VAssembledIn = wrap(MapPin);
export const VManufacturer = wrap(Factory);
export const VSpecs = wrap(DocumentReport);

// Safety overview
export const VSafety = wrap(ShieldCheck);
export const VComplaints = wrap(MessageComplaints);
export const VCrashes = wrap(CrashCollision, 1.4);
export const VRecalls = wrap(TriangleAlertRecall);
export const VInvestigationsClear = wrap(ShieldCheck);
export const VInvestigationsOpen = wrap(ShieldInvestigation);

// Report sections
export const VValuePricing = wrap(MarketValue);
export const VDepreciation = wrap(Depreciation);
export const VHistorySummary = wrap(VehicleHistory);
export const VMileage = wrap(Odometer);
export const VRedFlags = wrap(GeneralWarning);
export const VOwnership = wrap(OwnershipHistory);
export const VAuction = wrap(AuctionHistory);
export const VTitleRecords = wrap(VehicleTitle);
export const VDeal = wrap(GoodDeal);
export const VComparables = wrap(SimilarListings);
export const VMaintenance = wrap(ServiceHistory);
export const VRecallsNotices = wrap(RecallCampaign);
export const VCrashSafety = wrap(CrashTest);
export const VFactoryEquipment = wrap(Checklist);
export const VEvOwnership = wrap(ChargingStation);
export const VRecommendation = wrap(AiSummary);
export const VLock = wrap(LockIcon);
// Matches VCrashes' 1.4× so the accident + crash tiles read at the same weight.
export const VAccidents = wrap(AccidentDamage, 1.4);
export const VTheft = wrap(TheftStolen);
export const VLien = wrap(LienIcon);
export const VCameraScan = wrap(CameraScan);

// Extended specifications
export const VTrim = wrap(TrimLevel);
export const VTransmission = wrap(TransmissionIcon);
export const VCylinders = wrap(Cylinders);
export const VSeats = wrap(SeatCount);
export const VSeries = wrap(YearMakeModel);
export const VWheelbase = wrap(WheelbaseIcon);
export const VWeight = wrap(TowPackage);
export const VBrakes = wrap(BrakeService);
export const VBattery = wrap(BatteryService);
