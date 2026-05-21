import { convertEnquiryToBooking } from '../workflows/enquiryBookingActions'

const convertToBooking = async (enquiry) => {
  return convertEnquiryToBooking({ enquiryId: enquiry.id })
}

export default convertToBooking
