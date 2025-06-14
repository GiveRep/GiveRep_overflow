import * as React from "react"
import { Calendar as CalendarIcon, Clock, Globe } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { addDays, format, setHours, setMinutes } from "date-fns"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface DateTimeRangePickerProps {
  className?: string
  value: { from: Date | null; to: Date | null }
  onChange: (value: { from: Date | null; to: Date | null }) => void
  placeholder?: string
  fromDate?: Date
  toDate?: Date
}

export function DateTimeRangePicker({
  className,
  value,
  onChange,
  placeholder = "Select date and time range",
  fromDate,
  toDate,
}: DateTimeRangePickerProps) {
  // Get user's timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(
    value.from && value.to
      ? { from: value.from, to: value.to }
      : undefined
  )
  const [fromTime, setFromTime] = React.useState<string>(
    value.from ? format(value.from, "HH:mm") : "00:00"
  )
  const [toTime, setToTime] = React.useState<string>(
    value.to ? format(value.to, "HH:mm") : "23:59"
  )

  // Update internal state when value prop changes
  React.useEffect(() => {
    if (value.from && value.to) {
      setDateRange({ from: value.from, to: value.to })
      setFromTime(format(value.from, "HH:mm"))
      setToTime(format(value.to, "HH:mm"))
    } else {
      setDateRange(undefined)
      setFromTime("00:00")
      setToTime("23:59")
    }
  }, [value.from, value.to])

  const updateDateTime = (range: DateRange | undefined, fromTimeStr: string, toTimeStr: string) => {
    if (!range?.from || !range?.to) {
      onChange({ from: null, to: null })
      return
    }

    const [fromHours, fromMinutes] = fromTimeStr.split(":").map(Number)
    const [toHours, toMinutes] = toTimeStr.split(":").map(Number)

    // Create new dates in local timezone to avoid UTC conversion issues
    const fromDateTime = new Date(range.from)
    fromDateTime.setHours(fromHours, fromMinutes, 0, 0)
    
    const toDateTime = new Date(range.to)
    toDateTime.setHours(toHours, toMinutes, 0, 0)

    onChange({ from: fromDateTime, to: toDateTime })
  }

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range)
    updateDateTime(range, fromTime, toTime)
  }

  const handleFromTimeChange = (time: string) => {
    setFromTime(time)
    updateDateTime(dateRange, time, toTime)
  }

  const handleToTimeChange = (time: string) => {
    setToTime(time)
    updateDateTime(dateRange, fromTime, time)
  }

  const formatDisplay = () => {
    if (!value.from || !value.to) return placeholder
    
    return `${format(value.from, "MMM dd, yyyy HH:mm")} - ${format(value.to, "MMM dd, yyyy HH:mm")}`
  }
  
  // Format the selected date range for display
  const formatSelectedRange = () => {
    if (!dateRange?.from || !dateRange?.to) return null
    
    const fromStr = format(dateRange.from, "MMM dd, yyyy")
    const toStr = format(dateRange.to, "MMM dd, yyyy")
    
    if (fromStr === toStr) {
      return fromStr
    }
    return `${fromStr} - ${toStr}`
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !value.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{formatDisplay()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Timezone indicator */}
          <div className="p-3 border-b bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                <span>All times in {userTimezone}</span>
              </div>
              {formatSelectedRange() && (
                <Badge variant="secondary" className="text-xs">
                  {formatSelectedRange()}
                </Badge>
              )}
            </div>
          </div>
          
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleDateRangeChange}
            numberOfMonths={2}
            className="border-0"
            fromDate={fromDate}
            toDate={toDate}
          />
          
          {/* Time Selection */}
          {dateRange?.from && dateRange?.to && (
            <div className="p-4 border-t space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                <span>Select Time</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from-time" className="text-sm font-medium">
                    Start Time
                    {dateRange.from && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({format(dateRange.from, "MMM dd")})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="from-time"
                    type="time"
                    value={fromTime}
                    onChange={(e) => handleFromTimeChange(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to-time" className="text-sm font-medium">
                    End Time
                    {dateRange.to && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({format(dateRange.to, "MMM dd")})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="to-time"
                    type="time"
                    value={toTime}
                    onChange={(e) => handleToTimeChange(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              {/* Selected DateTime Display */}
              <div className="mt-3 p-3 bg-muted/50 rounded-md">
                <div className="text-xs text-muted-foreground mb-1">Selected Range:</div>
                <div className="text-sm font-medium">
                  {dateRange.from && format(
                    setMinutes(setHours(dateRange.from, parseInt(fromTime.split(':')[0])), parseInt(fromTime.split(':')[1])),
                    "MMM dd, yyyy 'at' HH:mm"
                  )}
                  {' → '}
                  {dateRange.to && format(
                    setMinutes(setHours(dateRange.to, parseInt(toTime.split(':')[0])), parseInt(toTime.split(':')[1])),
                    "MMM dd, yyyy 'at' HH:mm"
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="p-3 border-t border-border flex justify-between space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const endOfDay = new Date(today)
                endOfDay.setHours(23, 59, 59, 999)
                const range = {
                  from: today,
                  to: endOfDay,
                }
                setDateRange(range)
                setFromTime("00:00")
                setToTime("23:59")
                updateDateTime(range, "00:00", "23:59")
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date()
                today.setHours(23, 59, 59, 999)
                const sevenDaysAgo = new Date()
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
                sevenDaysAgo.setHours(0, 0, 0, 0)
                const range = {
                  from: sevenDaysAgo,
                  to: today,
                }
                setDateRange(range)
                setFromTime("00:00")
                setToTime("23:59")
                updateDateTime(range, "00:00", "23:59")
              }}
            >
              Last 7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date()
                today.setHours(23, 59, 59, 999)
                const thirtyDaysAgo = new Date()
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                thirtyDaysAgo.setHours(0, 0, 0, 0)
                const range = {
                  from: thirtyDaysAgo,
                  to: today,
                }
                setDateRange(range)
                setFromTime("00:00")
                setToTime("23:59")
                updateDateTime(range, "00:00", "23:59")
              }}
            >
              Last 30 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateRange(undefined)
                onChange({ from: null, to: null })
              }}
            >
              Reset
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}